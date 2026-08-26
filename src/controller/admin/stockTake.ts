import { Request, Response } from "express";
import { BadRequest, NotFound } from "../../Errors";
import { SuccessResponse } from "../../utils/response";
import { generateCode } from "../../utils/generateCodeStock";
import { StocktakeModel } from "../../models/schema/admin/stockTake";
import { StocktakeItemModel } from "../../models/schema/admin/stockTakeItem";
import { Product_WarehouseModel } from "../../models/schema/admin/Product_Warehouse";
import { WarehouseModel } from "../../models/schema/admin/Warehouse";
import ExcelJS from "exceljs";
import { AnyBulkWriteOperation } from "mongoose";
import { ProductPriceModel, ProductPriceOptionModel } from "../../models/schema/admin/product_price";
import { VariationModel } from "../../models/schema/admin/Variation";
import { ProductModel } from "../../models/schema/admin/products";
import { WastedModel } from "../../models/schema/admin/wasted";

export const createStocktake = async (req: Request, res: Response) => {
  const { warehouseId, type, mode, productIds } = req.body;

  if (!warehouseId) throw new BadRequest("Warehouse id is required");
  if (!["full", "partial"].includes(type))
    throw new BadRequest("Type must be full or partial");
  if (!["manual", "excel"].includes(mode))
    throw new BadRequest("Mode must be manual or excel");

  const warehouse = await WarehouseModel.findById(warehouseId);
  if (!warehouse) throw new NotFound("Warehouse not found");

  if (
    type === "partial" &&
    (!Array.isArray(productIds) || productIds.length === 0)
  ) {
    throw new BadRequest("productIds is required for partial stocktake");
  }

  const activeStocktake = await StocktakeModel.findOne({
    warehouseId,
    status: "processing",
  });
  if (activeStocktake) {
    throw new BadRequest(
      "There is already a processing stocktake for this warehouse"
    );
  }

  const code = await generateCode("stk");

  const stocktake = await StocktakeModel.create({
    code,
    warehouseId,
    type,
    mode,
    status: "processing",
    createdBy: req.user?.id,
  });

  // start from the product catalog, not from Product_Warehouse, so products/variants
  // with no stock record yet still show up (systemQty defaults to 0)
  const productQuery: any = {};
  if (type === "partial") productQuery._id = { $in: productIds };

  const products = await ProductModel.find(productQuery).select("name code").lean();

  if (products.length === 0) {
    await StocktakeModel.deleteOne({ _id: stocktake._id });
    throw new BadRequest("No products found for this selection");
  }

  const productIdList = products.map((p: any) => p._id);

  const priceVariants = await ProductPriceModel.find({
    productId: { $in: productIdList },
  })
    .select("productId code")
    .lean();

  const existingStockRows = await Product_WarehouseModel.find({
    warehouseId,
    productId: { $in: productIdList },
  }).lean();

  // key: productId|productPriceId(or "null") -> quantity
  const stockMap = new Map<string, number>();
  existingStockRows.forEach((row: any) => {
    const key = `${row.productId.toString()}|${row.productPriceId ? row.productPriceId.toString() : "null"}`;
    stockMap.set(key, row.quantity);
  });

  const variantsByProductId = new Map<string, any[]>();
  priceVariants.forEach((pv: any) => {
    const key = pv.productId.toString();
    if (!variantsByProductId.has(key)) variantsByProductId.set(key, []);
    variantsByProductId.get(key)!.push(pv);
  });

  const items: any[] = [];

  products.forEach((product: any) => {
    const productIdStr = product._id.toString();
    const variants = variantsByProductId.get(productIdStr) || [];

    if (variants.length > 0) {
      // product has variations - one item per variant
      variants.forEach((variant: any) => {
        const key = `${productIdStr}|${variant._id.toString()}`;
        const systemQty = stockMap.get(key) ?? 0; // default 0 if never stocked in this warehouse

        items.push({
          stocktakeId: stocktake._id,
          productId: product._id,
          productPriceId: variant._id,
          warehouseId,
          productNameSnapshot: product.name || "",
          skuSnapshot: variant.code || product.code || "",
          systemQty,
          actualQty: null,
          difference: null,
          resolutionStatus: "pending",
          resolutionType: null,
        });
      });
    } else {
      // simple product, no variations
      const key = `${productIdStr}|null`;
      const systemQty = stockMap.get(key) ?? 0;

      items.push({
        stocktakeId: stocktake._id,
        productId: product._id,
        productPriceId: null,
        warehouseId,
        productNameSnapshot: product.name || "",
        skuSnapshot: product.code || "",
        systemQty,
        actualQty: null,
        difference: null,
        resolutionStatus: "pending",
        resolutionType: null,
      });
    }
  });

  const CHUNK_SIZE = 500;
  for (let i = 0; i < items.length; i += CHUNK_SIZE) {
    await StocktakeItemModel.insertMany(items.slice(i, i + CHUNK_SIZE));
  }

  SuccessResponse(res, {
    message: "Stocktake created successfully",
    stocktake,
    itemCount: items.length,
  });
};

export const getStocktakeItems = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { search = "", page = 1, limit = 50, resolutionType } = req.query;

  const stocktake = await StocktakeModel.findById(id);
  if (!stocktake) throw new NotFound("Stocktake not found");

  const query: any = { stocktakeId: id };

  if (resolutionType) {
    query.resolutionType = resolutionType;
  }

  const allItems = await StocktakeItemModel.find(query).lean();

  const variations = await VariationModel.find().lean();

  const productPriceIds = [
    ...new Set(
      allItems
        .filter((i: any) => i.productPriceId)
        .map((i: any) => i.productPriceId.toString())
    ),
  ];

  const optionLabelsByPriceId = new Map<string, string>();

  if (productPriceIds.length > 0) {
    const allOptions = await ProductPriceOptionModel.find({
      product_price_id: { $in: productPriceIds },
    })
      .populate({
        path: "option_id",
        select: "_id name variationId",
      })
      .lean();

    // group by productPriceId first, same shape as getProduct's per-price grouping
    const optionsByPriceId: Record<string, any[]> = {};
    for (const po of allOptions as any[]) {
      const priceId = po.product_price_id.toString();
      if (!optionsByPriceId[priceId]) optionsByPriceId[priceId] = [];
      optionsByPriceId[priceId].push(po);
    }

    for (const priceId of Object.keys(optionsByPriceId)) {
      const groupedOptions: Record<string, any[]> = {};

      for (const po of optionsByPriceId[priceId]) {
        const option = po.option_id as any;
        if (!option?._id) continue; // orphaned link, same guard as getProduct

        const variation = variations.find(
          (v: any) => v._id.toString() === option.variationId?.toString()
        );

        if (variation) {
          if (!groupedOptions[variation.name])
            groupedOptions[variation.name] = [];
          groupedOptions[variation.name].push(option);
        }
      }

      const labelParts: string[] = [];
      for (const varName of Object.keys(groupedOptions)) {
        const optionNames = groupedOptions[varName]
          .map((o: any) => o.name)
          .join("/");
        labelParts.push(optionNames);
      }

      if (labelParts.length > 0) {
        optionLabelsByPriceId.set(priceId, labelParts.join(" - "));
      }
    }
  }

  const resolvedItems = allItems.map((item: any) => {
    const variationLabel = item.productPriceId
      ? optionLabelsByPriceId.get(item.productPriceId.toString())
      : null;

    const displayName =
      variationLabel && !item.productNameSnapshot.includes(variationLabel)
        ? `${item.productNameSnapshot} - ${variationLabel}`
        : item.productNameSnapshot;

    return { ...item, productNameSnapshot: displayName };
  });

  const searchLower = String(search).toLowerCase();
  const filtered = search
    ? resolvedItems.filter(
        (i: any) =>
          i.productNameSnapshot.toLowerCase().includes(searchLower) ||
          i.skuSnapshot.toLowerCase().includes(searchLower)
      )
    : resolvedItems;

  filtered.sort((a: any, b: any) =>
    a.productNameSnapshot.localeCompare(b.productNameSnapshot)
  );

  const total = filtered.length;
  const pageNum = Math.max(Number(page), 1);
  const limitNum = Math.max(Number(limit), 1);
  const paginated = filtered.slice(
    (pageNum - 1) * limitNum,
    (pageNum - 1) * limitNum + limitNum
  );

  SuccessResponse(res, {
    items: paginated,
    pagination: {
      total,
      page: pageNum,
      limit: limitNum,
      pages: Math.ceil(total / limitNum),
    },
  });
};

export const updateStocktakeItem = async (req: Request, res: Response) => {
  const { id, itemId } = req.params;
  const { actualQty } = req.body;

  if (actualQty === undefined || actualQty === null) {
    throw new BadRequest("actualQty is required");
  }
  if (typeof actualQty !== "number" || actualQty < 0) {
    throw new BadRequest("actualQty must be a non-negative number");
  }

  const stocktake = await StocktakeModel.findById(id);
  if (!stocktake) throw new NotFound("Stocktake not found");
  if (stocktake.status !== "processing") {
    throw new BadRequest(
      "Cannot edit items on a stocktake that is not processing"
    );
  }

  const item = await StocktakeItemModel.findOneAndUpdate(
    { _id: itemId, stocktakeId: id },
    { $set: { actualQty } },
    { new: true }
  );
  if (!item) throw new NotFound("Stocktake item not found");

  SuccessResponse(res, { message: "Item updated successfully", item });
};

export const bulkUpdateStocktakeItems = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { items } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    throw new BadRequest("items array is required");
  }

  const stocktake = await StocktakeModel.findById(id);
  if (!stocktake) throw new NotFound("Stocktake not found");
  if (stocktake.status !== "processing") {
    throw new BadRequest(
      "Cannot edit items on a stocktake that is not processing"
    );
  }

  for (const row of items) {
    if (typeof row.actualQty !== "number" || row.actualQty < 0) {
      throw new BadRequest(`Invalid actualQty for item ${row.itemId}`);
    }
  }

  const ops = items.map((row: any) => ({
    updateOne: {
      filter: { _id: row.itemId, stocktakeId: id },
      update: { $set: { actualQty: row.actualQty } },
    },
  }));

  const result = await StocktakeItemModel.bulkWrite(ops);

  SuccessResponse(res, {
    message: "Items updated successfully",
    matched: result.matchedCount,
    modified: result.modifiedCount,
  });
};

export const exportStocktakeSheet = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { includeSystemQty = "true", includeDifference = "false" } = req.query;

  const showSystemQty = includeSystemQty === "true";
  const showDifference = includeDifference === "true";

  const stocktake = await StocktakeModel.findById(id).populate("warehouseId", "name");
  if (!stocktake) throw new NotFound("Stocktake not found");

  if (showDifference && stocktake.status !== "completed") {
    throw new BadRequest("Difference can only be exported for a completed stocktake");
  }

  const items = await StocktakeItemModel.find({ stocktakeId: id })
    .sort({ productNameSnapshot: 1 })
    .lean();
  if (items.length === 0) throw new BadRequest("This stocktake has no items");

  const variations = await VariationModel.find().lean();

  const productPriceIds = [
    ...new Set(
      items.filter((i: any) => i.productPriceId).map((i: any) => i.productPriceId.toString())
    ),
  ];

  const optionLabelsByPriceId = new Map<string, string>();

  if (productPriceIds.length > 0) {
    const allOptions = await ProductPriceOptionModel.find({
      product_price_id: { $in: productPriceIds },
    })
      .populate({ path: "option_id", select: "_id name variationId" })
      .lean();

    const optionsByPriceId: Record<string, any[]> = {};
    for (const po of allOptions as any[]) {
      const priceId = po.product_price_id.toString();
      if (!optionsByPriceId[priceId]) optionsByPriceId[priceId] = [];
      optionsByPriceId[priceId].push(po);
    }

    for (const priceId of Object.keys(optionsByPriceId)) {
      const groupedOptions: Record<string, any[]> = {};

      for (const po of optionsByPriceId[priceId]) {
        const option = po.option_id as any;
        if (!option?._id) continue;

        const variation = variations.find(
          (v: any) => v._id.toString() === option.variationId?.toString()
        );

        if (variation) {
          if (!groupedOptions[variation.name]) groupedOptions[variation.name] = [];
          groupedOptions[variation.name].push(option);
        }
      }

      const labelParts = Object.keys(groupedOptions).map((varName) =>
        groupedOptions[varName].map((o: any) => o.name).join("/")
      );

      if (labelParts.length > 0) {
        optionLabelsByPriceId.set(priceId, labelParts.join(" - "));
      }
    }
  }

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Stocktake");

  const columns: any[] = [
    { header: "ID", key: "itemId", width: 26, hidden: true },
    { header: "Product", key: "product", width: 40 },
    { header: "System Qty", key: "systemQty", width: 14 },
    { header: "Actual Qty", key: "actualQty", width: 14 },
  ];

  if (showDifference) {
    columns.push({ header: "Difference", key: "difference", width: 14 });
    columns.push({ header: "Status", key: "resolutionType", width: 14 });
  }

  worksheet.columns = columns;

  items.forEach((item: any) => {
    const variationLabel = item.productPriceId
      ? optionLabelsByPriceId.get(item.productPriceId.toString())
      : null;

    const productDisplayName =
      variationLabel && !item.productNameSnapshot.includes(variationLabel)
        ? `${item.productNameSnapshot} - ${variationLabel}`
        : item.productNameSnapshot;

    const row: any = {
      itemId: item._id.toString(),
      product: productDisplayName,
      systemQty: showSystemQty ? item.systemQty : "",
      actualQty: item.actualQty ?? "",
    };

    if (showDifference) {
      row.difference = item.difference ?? "";
      row.resolutionType = item.resolutionType || (item.resolutionStatus === "skipped" ? "skipped" : "");
    }

    worksheet.addRow(row);
  });

  // when exporting a diff report, nothing is meant to be edited/re-imported - lock everything
  // when exporting a blank fill-in sheet, keep Actual Qty (col 4) editable as before
  worksheet.eachRow((row) => {
    row.eachCell((cell, colNumber) => {
      cell.protection = { locked: showDifference ? true : colNumber !== 4 };
    });
  });

  worksheet.protect(process.env.STOCKTAKE_SHEET_PASSWORD || "systego-stocktake", {
    selectLockedCells: true,
    selectUnlockedCells: true,
    formatCells: false,
    formatColumns: false,
    formatRows: false,
    insertRows: false,
    insertColumns: false,
    insertHyperlinks: false,
    deleteRows: false,
    deleteColumns: false,
    sort: false,
    autoFilter: false,
    pivotTables: false,
  });

  const filename = showDifference
    ? `stocktake-${stocktake.code}-diff.xlsx`
    : `stocktake-${stocktake.code}.xlsx`;

  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  res.setHeader("Content-Disposition", `attachment; filename=${filename}`);

  await workbook.xlsx.write(res);
  res.end();
};

export const importStocktakeSheet = async (req: Request, res: Response) => {
  const { id } = req.params;

  if (!req.file) throw new BadRequest("Excel file is required");

  const stocktake = await StocktakeModel.findById(id);
  if (!stocktake) throw new NotFound("Stocktake not found");
  if (stocktake.status !== "processing") {
    throw new BadRequest("Cannot import into a stocktake that is not processing");
  }

  const workbook = new ExcelJS.Workbook();
  const arrayBuffer = req.file.buffer.buffer.slice(
    req.file.buffer.byteOffset,
    req.file.buffer.byteOffset + req.file.buffer.byteLength
  ) as ArrayBuffer;
  await workbook.xlsx.load(arrayBuffer);

  const worksheet = workbook.getWorksheet(1);
  if (!worksheet) throw new BadRequest("Invalid Excel file");

  const headers: string[] = [];
  worksheet.getRow(1).eachCell((cell, colNumber) => {
    headers[colNumber] = cell.value?.toString().trim().toLowerCase() || "";
  });

  const findColumn = (names: string[]): number => {
    for (const name of names) {
      const index = headers.findIndex((h) => h === name.toLowerCase());
      if (index !== -1) return index;
    }
    return -1;
  };

  const cols = {
    itemId: findColumn(["id", "item id", "itemid"]),
    actualQty: findColumn(["actual qty", "actual", "actual (counted)"]),
  };

  // structural error - genuinely can't proceed, block the whole import
  if (cols.itemId === -1 || cols.actualQty === -1) {
    throw new BadRequest(
      "Sheet is missing required columns (ID, Actual Qty). Please use the exported template without modifying its structure."
    );
  }

  const objectIdRegex = /^[0-9a-fA-F]{24}$/;

  const validRows: { itemId: string; actualQty: number }[] = [];
  const skipped: { row: number; reason: string }[] = [];

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;

    const itemId = row.getCell(cols.itemId).value?.toString().trim() || "";
    const rawQty = row.getCell(cols.actualQty).value;

    if (!itemId) {
      // no id at all on this row - can't do anything with it, likely a stray blank row
      return;
    }

    if (!objectIdRegex.test(itemId)) {
      skipped.push({
        row: rowNumber,
        reason: "ID column value is invalid — the sheet structure may have been altered",
      });
      return;
    }

    // not counted yet - not an error, just nothing to import for this row
    if (rawQty === null || rawQty === undefined || rawQty === "") {
      skipped.push({ row: rowNumber, reason: "Not counted (Actual Qty is empty)" });
      return;
    }

    const actualQty = Number(rawQty);
    if (isNaN(actualQty) || actualQty < 0) {
      // content is wrong, but don't fail the whole import - report it and move on
      skipped.push({
        row: rowNumber,
        reason: `Invalid value "${rawQty}" in Actual Qty — must be a non-negative number`,
      });
      return;
    }

    validRows.push({ itemId, actualQty });
  });

  const validItemIds = new Set(
    (await StocktakeItemModel.find({ stocktakeId: id }).select("_id").lean()).map((i) =>
      i._id.toString()
    )
  );

  const ops: any[] = [];
  validRows.forEach((row) => {
    if (!validItemIds.has(row.itemId)) {
      skipped.push({
        row: 0,
        reason: `Item ${row.itemId} does not belong to this stocktake`,
      });
      return;
    }
    ops.push({
      updateOne: {
        filter: { _id: row.itemId, stocktakeId: id },
        update: { $set: { actualQty: row.actualQty } },
      },
    });
  });

  const result = ops.length
    ? await StocktakeItemModel.bulkWrite(ops)
    : { modifiedCount: 0 };

  SuccessResponse(res, {
    message:
      ops.length > 0
        ? "Import completed"
        : "Import processed, but no rows had valid data to apply — check the details below",
    imported: ops.length,
    modified: result.modifiedCount,
    skipped_count: skipped.length,
    skipped,
  });
};

export const submitStocktake = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { treatUnfilledAsSkipped = false, items } = req.body;

  const stocktake = await StocktakeModel.findById(id);
  if (!stocktake) throw new NotFound("Stocktake not found");
  if (stocktake.status !== "processing") {
    throw new BadRequest("Only a processing stocktake can be submitted");
  }

  // optional: apply final quantities sent along with submit, same as bulkUpdateStocktakeItems
  if (items !== undefined) {
    if (!Array.isArray(items) || items.length === 0) {
      throw new BadRequest("items must be a non-empty array if provided");
    }

    for (const row of items) {
      if (!row.itemId) {
        throw new BadRequest("Each item must include itemId");
      }
      if (typeof row.actualQty !== "number" || row.actualQty < 0) {
        throw new BadRequest(`Invalid actualQty for item ${row.itemId}`);
      }
    }

    const updateOps = items.map((row: any) => ({
      updateOne: {
        filter: { _id: row.itemId, stocktakeId: id },
        update: { $set: { actualQty: row.actualQty } },
      },
    }));

    await StocktakeItemModel.bulkWrite(updateOps);
  }

  const allItems = await StocktakeItemModel.find({ stocktakeId: id });
  if (allItems.length === 0) throw new BadRequest("Stocktake has no items");

  const unfilled = allItems.filter(
    (i) => i.actualQty === null || i.actualQty === undefined
  );
  if (unfilled.length > 0 && !treatUnfilledAsSkipped) {
    throw new BadRequest(
      `${unfilled.length} item(s) have no actual quantity. Fill them or pass treatUnfilledAsSkipped=true`
    );
  }

  const ops = allItems.map((item) => {
    const counted = item.actualQty !== null && item.actualQty !== undefined;

    if (!counted) {
      return {
        updateOne: {
          filter: { _id: item._id },
          update: {
            $set: {
              difference: null,
              resolutionType: null,
              resolutionStatus: "skipped" as const,
            },
          },
        },
      };
    }

    const difference = item.actualQty! - item.systemQty;
    const resolutionType =
      difference > 0 ? "surplus" as const : difference < 0 ? "shortage" as const : "match" as const;
    const resolutionStatus = resolutionType === "match" ? "resolved" as const : "pending" as const;

    return {
      updateOne: {
        filter: { _id: item._id },
        update: {
          $set: { difference, resolutionType, resolutionStatus },
        },
      },
    };
  });

  await StocktakeItemModel.bulkWrite(ops);

  stocktake.status = "completed";
  stocktake.completedAt = new Date();
  await stocktake.save();

  const updatedItems = await StocktakeItemModel.find({ stocktakeId: id }).lean();

  const summary = {
    total: updatedItems.length,
    matched: updatedItems.filter((i) => i.resolutionType === "match").length,
    shortages: updatedItems.filter((i) => i.resolutionType === "shortage").length,
    surpluses: updatedItems.filter((i) => i.resolutionType === "surplus").length,
    skipped: updatedItems.filter((i) => i.resolutionStatus === "skipped").length,
  };

  SuccessResponse(res, {
    message: "Stocktake submitted successfully",
    stocktake,
    summary,
    items: updatedItems,
  });
};

export const cancelStocktake = async (req: Request, res: Response) => {
  const { id } = req.params;

  const stocktake = await StocktakeModel.findById(id);
  if (!stocktake) throw new NotFound("Stocktake not found");
  if (stocktake.status !== "processing") {
    throw new BadRequest("Only a processing stocktake can be cancelled");
  }

  stocktake.status = "cancelled";
  await stocktake.save();

  SuccessResponse(res, {
    message: "Stocktake cancelled successfully",
    stocktake,
  });
};

export const getStocktakeById = async (req: Request, res: Response) => {
  const { id } = req.params;

  const stocktake = await StocktakeModel.findById(id)
    .populate("warehouseId", "name")
    .populate("createdBy", "username");
  if (!stocktake) throw new NotFound("Stocktake not found");

  const summary = {
    total: await StocktakeItemModel.countDocuments({ stocktakeId: id }),
    matched: await StocktakeItemModel.countDocuments({
      stocktakeId: id,
      resolutionType: "match",
    }),
    shortages: await StocktakeItemModel.countDocuments({
      stocktakeId: id,
      resolutionType: "shortage",
    }),
    surpluses: await StocktakeItemModel.countDocuments({
      stocktakeId: id,
      resolutionType: "surplus",
    }),
    skipped: await StocktakeItemModel.countDocuments({
      stocktakeId: id,
      resolutionStatus: "skipped",
    }),
  };

  SuccessResponse(res, { stocktake, summary });
};

export const getStocktakes = async (req: Request, res: Response) => {
  const { warehouseId, status, type, page = 1, limit = 20 } = req.query;

  const query: any = {};
  if (warehouseId) query.warehouseId = warehouseId;
  if (status) query.status = status;
  if (type) query.type = type;

  const pageNum = Math.max(Number(page), 1);
  const limitNum = Math.max(Number(limit), 1);

  const [stocktakes, total] = await Promise.all([
    StocktakeModel.find(query)
      .populate("warehouseId", "name")
      .populate("createdBy", "username")
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean(),
    StocktakeModel.countDocuments(query),
  ]);

  SuccessResponse(res, {
    stocktakes,
    pagination: {
      total,
      page: pageNum,
      limit: limitNum,
      pages: Math.ceil(total / limitNum),
    },
  });
};

export const resolveStocktakeItems = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { itemId, action, note, referenceId } = req.body;

  if (!itemId) {
    throw new BadRequest("itemId is required");
  }

  const validActions = ["ignore", "adjust_stock", "send_to_wasted", "create_purchase"];
  if (!validActions.includes(action)) {
    throw new BadRequest(`action must be one of: ${validActions.join(", ")}`);
  }

  const stocktake = await StocktakeModel.findById(id);
  if (!stocktake) throw new NotFound("Stocktake not found");
  if (stocktake.status !== "completed") {
    throw new BadRequest("Stocktake must be completed before resolving items");
  }

  const item = await StocktakeItemModel.findOne({
    _id: itemId,
    stocktakeId: id,
    resolutionStatus: "pending",
  });

  if (!item) {
    throw new NotFound("Pending item not found for the given itemId");
  }

  if (action === "ignore") {
    await StocktakeItemModel.updateOne(
      { _id: item._id },
      {
        $set: {
          resolutionStatus: "resolved",
          resolutionAction: "ignore",
          resolvedAt: new Date(),
          resolvedBy: req.user?.id,
        },
      }
    );
  }

  if (action === "adjust_stock") {
    // apply only the delta found during the count, not an absolute overwrite -
    // live quantity may have changed (sales/purchases) since systemQty was snapshotted
    await Product_WarehouseModel.findOneAndUpdate(
      { productId: item.productId, productPriceId: item.productPriceId, warehouseId: item.warehouseId },
      { $inc: { quantity: item.difference } }
    );
    await StocktakeItemModel.updateOne(
      { _id: item._id },
      {
        $set: {
          resolutionStatus: "resolved",
          resolutionAction: "adjust_stock",
          resolvedAt: new Date(),
          resolvedBy: req.user?.id,
        },
      }
    );
  }

  if (action === "send_to_wasted") {
    if (item.resolutionType !== "shortage") {
      throw new BadRequest("send_to_wasted is only valid for shortage items");
    }

    const wastedQty = Math.abs(item.difference!);

    await WastedModel.create({
      productId: item.productId,
      productPriceId: item.productPriceId,
      warehouseId: item.warehouseId,
      quantity: wastedQty,
      reason: "stocktake_not_found",
      note: note || `From stocktake ${stocktake.code}`,
      userId: req.user?.id,
    });

    // same fix - shift by the delta (a negative number for shortages), don't overwrite live stock
    await Product_WarehouseModel.findOneAndUpdate(
      { productId: item.productId, productPriceId: item.productPriceId, warehouseId: item.warehouseId },
      { $inc: { quantity: item.difference } }
    );

    await StocktakeItemModel.updateOne(
      { _id: item._id },
      {
        $set: {
          resolutionStatus: "resolved",
          resolutionAction: "send_to_wasted",
          resolvedAt: new Date(),
          resolvedBy: req.user?.id,
        },
      }
    );
  }

  if (action === "create_purchase") {
    if (item.resolutionType !== "surplus") {
      throw new BadRequest("create_purchase is only valid for surplus items");
    }
    if (!referenceId) {
      throw new BadRequest("referenceId (purchase id) is required for create_purchase");
    }

    await StocktakeItemModel.updateOne(
      { _id: item._id },
      {
        $set: {
          resolutionStatus: "resolved",
          resolutionAction: "create_purchase",
          resolutionReferenceId: referenceId,
          resolvedAt: new Date(),
          resolvedBy: req.user?.id,
        },
      }
    );
  }

  const updatedItem = await StocktakeItemModel.findById(item._id).lean();

  SuccessResponse(res, {
    message: "Item resolved successfully",
    item: updatedItem,
  });
};
