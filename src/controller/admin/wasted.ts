import { Request, Response } from "express";
import mongoose from "mongoose";
import { WastedModel } from "../../models/schema/admin/wasted";
import { Product_WarehouseModel } from "../../models/schema/admin/Product_Warehouse";
import { ProductModel } from "../../models/schema/admin/products";
import { BadRequest } from "../../Errors/BadRequest";
import { SuccessResponse } from "../../utils/response";
import { ForbiddenError } from "../../Errors";
import { ProductPriceModel } from "../../models/schema/admin/product_price";

// ==================== Create Wasted Entry ====================
export const createWasted = async (req: Request, res: Response) => {
  try {
    const {
      productId,
      productPriceId = null,
      warehouseId,
      quantity,
      reason,
      note,
    } = req.body;
    const jwtUser = req.user as any;
    const userId = jwtUser?.id || jwtUser?._id;
    console.log("createWasted request body:", req.body);
    if (!productId || !warehouseId || !quantity || !reason) {
      throw new BadRequest(
        "productId, warehouseId, quantity, and reason are required"
      );
    }
    if (quantity <= 0) {
      throw new BadRequest("quantity must be greater than 0");
    }

    const product = await ProductModel.findOneAndUpdate(
      { _id: productId },
      { $inc: { quantity: -quantity } },
      { new: true }
    );
    if (!product) {
      throw new BadRequest("Product not found");
    }

    const productPrice = await ProductPriceModel.findOneAndUpdate(
      { _id: productPriceId },
      { $inc: { quantity: -quantity } },
      { new: true }
    );

    if (!productPrice && productPriceId) {
      throw new BadRequest("Product price not found");
    }

    // 1. Atomically decrement stock, guarded so it can't go negative
    const stockDoc = await Product_WarehouseModel.findOneAndUpdate(
      {
        productId,
        productPriceId,
        warehouseId,
        quantity: { $gte: quantity },
      },
      { $inc: { quantity: -quantity } },
      { new: true }
    );

    if (!stockDoc) {
      throw new BadRequest(
        "Not enough stock in this warehouse to waste this quantity"
      );
    }

    // 3. Create the Wasted record
    let wastedDoc;
    try {
      wastedDoc = await WastedModel.create({
        productId,
        productPriceId,
        warehouseId,
        quantity,
        reason,
        note,
        userId,
      });
    } catch (err) {
      // 4. Rollback stock decrement if the Wasted doc failed to save
      await Product_WarehouseModel.findOneAndUpdate(
        { productId, productPriceId, warehouseId },
        { $inc: { quantity: quantity } }
      );
      throw err;
    }
    SuccessResponse(res, { message: "Wasted entry created", wastedDoc });
  } catch (error: any) {
    console.error("createWasted error:", error);
    throw new ForbiddenError(error.message || "Failed to create wasted entry");
  }
};

// ==================== Get All Wasted (with filters) ====================
export const getAllWasted = async (req: Request, res: Response) => {
  try {
    const {
      warehouseId,
      productId,
      reason,
      from,
      to,
      page = 1,
      limit = 20,
    } = req.query as Record<string, string>;

    const filter: any = {};
    if (warehouseId) filter.warehouseId = warehouseId;
    if (productId) filter.productId = productId;
    if (reason) filter.reason = reason;
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to) filter.createdAt.$lte = new Date(to);
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [items, total] = await Promise.all([
      WastedModel.find(filter)
        .populate("productId", "name ar_name code")
        .populate({
          path: "productPriceId",
          select: "code price", // we'll ignore code in final output
          populate: {
            path: "productpriceoptions",
            populate: {
              path: "option",
              populate: {
                path: "variation",
                select: "name ar_name",
              },
            },
          },
        })
        .populate("warehouseId", "name")
        .populate("userId", "username")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      WastedModel.countDocuments(filter),
    ]);

    // Transform productPriceId to { name, price }
    const transformedItems = items.map((item: any) => {
      if (item.productPriceId && item.productPriceId.productpriceoptions) {
        const price = item.productPriceId.price;
        const optionNames = item.productPriceId.productpriceoptions
          .map((po: any) => po.option?.name)
          .filter(Boolean);
        const name = optionNames.join("-"); // e.g., "sm-Blue"
        item.productPriceId = { name, price };
      } else {
        // If no product price or no options, set to null or {}
        item.productPriceId = null;
      }
      return item;
    });

    SuccessResponse(res, {
      message: "Wasted Fetched Successfully",
      data: transformedItems,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error: any) {
    console.error("getAllWasted error:", error);
    throw new ForbiddenError(error.message || "Failed to get wasted entries");
  }
};

// ==================== Get Wasted By Id ====================
export const getWastedById = async (req: Request, res: Response) => {
  try {
    const wasted = await WastedModel.findById(req.params.id)
      .populate("productId", "name ar_name code")
      .populate("productPriceId", "code")
      .populate("warehouseId", "name")
      .populate("userId", "name");

    if (!wasted) throw new ForbiddenError("Wasted entry not found");

    SuccessResponse(res, { message: "Wasted entry found", data: wasted });
  } catch (error: any) {
    console.error("getWastedById error:", error);
    throw new ForbiddenError(error.message || "Failed to get wasted entry");
  }
};

// ==================== Delete Wasted (restore stock) ====================
export const deleteWasted = async (req: Request, res: Response) => {
  try {
    const wasted = await WastedModel.findById(req.params.id);
    if (!wasted) throw new ForbiddenError("Wasted entry not found");

    // Restore the stock back since the waste record is being voided
    await Product_WarehouseModel.findOneAndUpdate(
      {
        productId: wasted.productId,
        productPriceId: wasted.productPriceId,
        warehouseId: wasted.warehouseId,
      },
      { $inc: { quantity: wasted.quantity } }
    );

    await WastedModel.findByIdAndDelete(req.params.id);

    SuccessResponse(res, {
      message: "Wasted entry deleted and stock restored",
    });
  } catch (error: any) {
    console.error("deleteWasted error:", error);
    throw new ForbiddenError(error.message || "Failed to delete wasted entry");
  }
};

// ==================== Wasted Stats (loss valuation) ====================
export const getWastedStats = async (req: Request, res: Response) => {
  try {
    const { warehouseId, from, to } = req.query as Record<string, string>;

    const match: any = {};
    if (warehouseId)
      match.warehouseId = new mongoose.Types.ObjectId(warehouseId);
    if (from || to) {
      match.createdAt = {};
      if (from) match.createdAt.$gte = new Date(from);
      if (to) match.createdAt.$lte = new Date(to);
    }

    const stats = await WastedModel.aggregate([
      { $match: match },
      {
        $group: {
          _id: "$reason",
          totalQuantity: { $sum: "$quantity" },
          totalLossValue: { $sum: { $multiply: ["$quantity", "$cost"] } },
          count: { $sum: 1 },
        },
      },
      { $sort: { totalLossValue: -1 } },
    ]);

    SuccessResponse(res, { message: "Wasted stats found", data: stats });
  } catch (error: any) {
    console.error("getWastedStats error:", error);
    throw new ForbiddenError(error.message || "Failed to get wasted stats");
  }
};
