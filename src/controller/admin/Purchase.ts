import { Request, Response } from "express";
import { PurchaseModel } from "../../models/schema/admin/Purchase";
import { PurchaseItemModel } from "../../models/schema/admin/purchase_item";
import { PurchaseDuePaymentModel } from "../../models/schema/admin/purchase_due_payment";
import { PurchaseInstallmentModel } from "../../models/schema/admin/PurchaseInstallment";
import { PurchaseItemOptionModel } from "../../models/schema/admin/purchase_item_option";
import { BankAccountModel } from "../../models/schema/admin/Financial_Account";
import { PurchaseInvoiceModel } from "../../models/schema/admin/PurchaseInvoice";
import { WarehouseModel } from "../../models/schema/admin/Warehouse";
import { SupplierModel } from "../../models/schema/admin/suppliers";
import { CurrencyModel } from "../../models/schema/admin/Currency";
import { TaxesModel } from "../../models/schema/admin/Taxes";
import { CategoryModel } from "../../models/schema/admin/category";
import { ProductModel } from "../../models/schema/admin/products";
import { VariationModel } from "../../models/schema/admin/Variation";
import { Product_WarehouseModel } from "../../models/schema/admin/Product_Warehouse";
import {
  ProductPriceModel,
  ProductPriceOptionModel,
} from "../../models/schema/admin/product_price";

import { SuccessResponse } from "../../utils/response";
import { BadRequest } from "../../Errors/BadRequest";
import { NotFound } from "../../Errors/NotFound";
import { saveBase64Image } from "../../utils/handleImages";
import {
  generateBarcodeImage,
  generateEAN13Barcode,
} from "../../utils/barcode";
import { any } from "joi";
import { MaterialModel } from "../../models/schema/admin/Materials";

export const getAllPurchases = async (req: Request, res: Response) => {
  const { page = 1, limit = 10, warehouse_id, supplier_id } = req.query;

  const filter: any = {};
  if (warehouse_id) filter.warehouse_id = warehouse_id;
  if (supplier_id) filter.supplier_id = supplier_id;

  // جلب كل الـ Purchases
  const allPurchases = await PurchaseModel.find(filter)
    .populate("warehouse_id")
    .populate("supplier_id")
    .populate("tax_id")
    .populate({
      path: "items",
      populate: [
        { path: "product_id" },
        { path: "material_id" },
        { path: "category_id" },
        {
          path: "options",
          populate: [{ path: "product_price_id" }, { path: "option_id" }],
        },
      ],
    })
    .populate("invoices")
    .populate("duePayments")
    .populate("installments")
    .sort({ createdAt: -1 });

  // تقسيم حسب الـ payment_status
  const fullPayments = allPurchases.filter(
    (p: any) => p.payment_status === "full"
  );
  const laterPayments = allPurchases.filter(
    (p: any) => p.payment_status === "later"
  );
  const partialPayments = allPurchases.filter(
    (p: any) => p.payment_status === "partial"
  );

  // حساب الإحصائيات
  const stats = {
    total_purchases: allPurchases.length,
    full_count: fullPayments.length,
    later_count: laterPayments.length,
    partial_count: partialPayments.length,
    total_amount: allPurchases.reduce(
      (sum: number, p: any) => sum + (p.grand_total || 0),
      0
    ),
    full_amount: fullPayments.reduce(
      (sum: number, p: any) => sum + (p.grand_total || 0),
      0
    ),
    later_amount: laterPayments.reduce(
      (sum: number, p: any) => sum + (p.grand_total || 0),
      0
    ),
    partial_amount: partialPayments.reduce(
      (sum: number, p: any) => sum + (p.grand_total || 0),
      0
    ),
  };

  SuccessResponse(res, {
    stats,
    purchases: {
      full: fullPayments,
      later: laterPayments,
      partial: partialPayments,
    },
  });
};

export const getPurchaseById = async (req: Request, res: Response) => {
  const { id } = req.params;

  const purchase = await PurchaseModel.findById(id)
    .populate("warehouse_id")
    .populate("supplier_id")
    .populate("tax_id")
    .populate({
      path: "items",
      populate: [
        { path: "product_id" },
        { path: "product_price_id" },
        { path: "material_id" },
        { path: "category_id" },
        { path: "warehouse_id" },
        {
          path: "options",
          populate: [{ path: "option_id" }, { path: "product_price_id" }],
        },
      ],
    })
    .populate("invoices")
    .populate("duePayments")
    .populate("installments");

  if (!purchase) throw new NotFound("Purchase not found");

  SuccessResponse(res, { purchase });
};

export const getLowStockProducts = async (req: Request, res: Response) => {
  const products = await ProductModel.find({
    $expr: { $lte: ["$quantity", "$low_stock"] },
  })
    .select("name ar_name code quantity low_stock image")
    .populate("categoryId", "name ar_name")
    .populate("brandId", "name ar_name");

  // تنسيق الـ response
  const formattedProducts = products.map((product) => ({
    _id: product._id,
    name: product.name,
    ar_name: product.ar_name,
    code: product.code,
    image: product.image,
    actual_stock: product.quantity,
    minimum_stock: product.low_stock ?? 0,
    shortage: (product.low_stock ?? 0) - (product.quantity ?? 0), // الفرق
    category: product.categoryId,
    brand: product.brandId,
  }));

  SuccessResponse(res, {
    message: "Low stock products retrieved successfully",
    count: formattedProducts.length,
    products: formattedProducts,
  });
};

// المنتجات اللي هتنتهي قريباً (خلال أسبوع)
export const getCriticalExpiryProducts = async (
  req: Request,
  res: Response
) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const nextWeek = new Date();
  nextWeek.setDate(nextWeek.getDate() + 7);
  nextWeek.setHours(23, 59, 59, 999);

  const criticalItems = await PurchaseItemModel.find({
    item_type: "product",
    date_of_expiery: {
      $exists: true,
      $ne: null,
      $gte: today,
      $lte: nextWeek,
    },
    quantity: { $gt: 0 },
  })
    .populate({
      path: "product_id",
      select: "name ar_name code image",
    })
    .populate({
      path: "warehouse_id",
      select: "name",
    })
    .select("product_id warehouse_id quantity date_of_expiery patch_number")
    .sort({ date_of_expiery: 1 });

  const formattedProducts = criticalItems.map((item) => {
    const expiryDate = new Date(item.date_of_expiery!);
    const diffTime = expiryDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    return {
      _id: item._id,
      product: item.product_id,
      warehouse: item.warehouse_id,
      quantity: item.quantity,
      patch_number: item.patch_number,
      expiry_date: item.date_of_expiery,
      days_remaining: diffDays,
    };
  });

  SuccessResponse(res, {
    message: "Critical expiry products retrieved successfully",
    count: formattedProducts.length,
    products: formattedProducts,
  });
};

export const getExpiringProducts = async (req: Request, res: Response) => {
  const { days = 30 } = req.query; // افتراضياً هيجيب اللي هتنتهي خلال 30 يوم

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + Number(days));
  futureDate.setHours(23, 59, 59, 999);

  // جيب الـ PurchaseItems اللي عندها تاريخ انتهاء
  const expiringItems = await PurchaseItemModel.find({
    item_type: "product",
    date_of_expiery: { $exists: true, $ne: null, $lte: futureDate },
  })
    .populate({
      path: "product_id",
      select: "name ar_name code image exp_ability",
    })
    .populate({
      path: "warehouse_id",
      select: "name",
    })
    .select("product_id warehouse_id quantity date_of_expiery patch_number")
    .sort({ date_of_expiery: 1 }); // الأقرب للانتهاء أولاً

  // تنسيق الـ response
  const formattedProducts = expiringItems.map((item) => {
    const expiryDate = new Date(item.date_of_expiery!);
    const diffTime = expiryDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    let status: string;
    if (diffDays < 0) {
      status = "expired";
    } else if (diffDays === 0) {
      status = "expires_today";
    } else if (diffDays <= 7) {
      status = "critical";
    } else if (diffDays <= 30) {
      status = "warning";
    } else {
      status = "normal";
    }

    return {
      _id: item._id,
      product: item.product_id,
      warehouse: item.warehouse_id,
      quantity: item.quantity,
      patch_number: item.patch_number,
      expiry_date: item.date_of_expiery,
      days_remaining: diffDays,
      status,
    };
  });

  // إحصائيات
  const stats = {
    total: formattedProducts.length,
    expired: formattedProducts.filter((p) => p.status === "expired").length,
    expires_today: formattedProducts.filter((p) => p.status === "expires_today")
      .length,
    critical: formattedProducts.filter((p) => p.status === "critical").length,
    warning: formattedProducts.filter((p) => p.status === "warning").length,
  };

  SuccessResponse(res, {
    message: "Expiring products retrieved successfully",
    stats,
    products: formattedProducts,
  });
};

// المنتجات المنتهية الصلاحية فقط
export const getExpiredProducts = async (req: Request, res: Response) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const expiredItems = await PurchaseItemModel.find({
    item_type: "product",
    date_of_expiery: { $exists: true, $ne: null, $lt: today },
    quantity: { $gt: 0 }, // اللي لسه فيها كمية
  })
    .populate({
      path: "product_id",
      select: "name ar_name code image",
    })
    .populate({
      path: "warehouse_id",
      select: "name",
    })
    .select("product_id warehouse_id quantity date_of_expiery patch_number")
    .sort({ date_of_expiery: 1 });

  const formattedProducts = expiredItems.map((item) => {
    const expiryDate = new Date(item.date_of_expiery!);
    const diffTime = today.getTime() - expiryDate.getTime();
    const expiredDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    return {
      _id: item._id,
      product: item.product_id,
      warehouse: item.warehouse_id,
      quantity: item.quantity,
      patch_number: item.patch_number,
      expiry_date: item.date_of_expiery,
      expired_since_days: expiredDays,
    };
  });

  SuccessResponse(res, {
    message: "Expired products retrieved successfully",
    count: formattedProducts.length,
    products: formattedProducts,
  });
};

export const selection = async (req: Request, res: Response): Promise<void> => {
  const { warehouseId } = req.query;

  // جلب البيانات الأساسية بشكل متوازي لتحسين الأداء
  const [warehouse, supplier, tax, currency, financial, products, variations] =
    await Promise.all([
      WarehouseModel.find().lean(),
      SupplierModel.find().lean(),
      TaxesModel.find().lean(),
      CurrencyModel.find().lean(),
      BankAccountModel.find({ status: "true" }).lean(),
      ProductModel.find()
        .populate("categoryId")
        .populate("brandId")
        .populate("taxesId")
        .lean(),
      VariationModel.find().lean(),
    ]);

  // جلب كل stocks و prices مرة واحدة بدلاً من كل منتج على حدة (تحسين الأداء)
  const productIds = products.map((p: any) => p._id);

  const stockQuery = warehouseId
    ? { productId: { $in: productIds }, warehouseId }
    : { productId: { $in: productIds } };

  const [allStocks, allPrices] = await Promise.all([
    Product_WarehouseModel.find(stockQuery)
      .populate("warehouseId", "name address")
      .lean(),
    ProductPriceModel.find({ productId: { $in: productIds } }).lean(),
  ]);

  // جلب كل الـ price options مرة واحدة
  const priceIds = allPrices.map((p: any) => p._id);
  const allPriceOptions = await ProductPriceOptionModel.find({
    product_price_id: { $in: priceIds },
  })
    .populate({
      path: "option_id",
      select: "_id name variationId",
    })
    .lean();

  // تجميع البيانات لكل منتج
  const formattedProducts = products.map((product: any) => {
    // فلترة الـ stocks الخاصة بهذا المنتج
    const stocks = allStocks.filter(
      (s: any) => s.productId.toString() === product._id.toString()
    );
    const totalQuantity = stocks.reduce(
      (sum: number, s: any) => sum + s.quantity,
      0
    );

    // فلترة الـ prices الخاصة بهذا المنتج
    const productPrices = allPrices.filter(
      (p: any) => p.productId.toString() === product._id.toString()
    );

    // تنسيق الأسعار مع الـ variations
    const formattedPrices = productPrices.map((price: any) => {
      const options = allPriceOptions.filter(
        (po: any) => po.product_price_id.toString() === price._id.toString()
      );

      const groupedOptions: Record<string, any[]> = {};

      for (const po of options) {
        const option = (po as any).option_id;
        if (!option?._id) continue;

        const variation = variations.find(
          (v: any) => v._id.toString() === option.variationId?.toString()
        );

        if (variation) {
          const varName = (variation as any).name;
          if (!groupedOptions[varName]) groupedOptions[varName] = [];
          groupedOptions[varName].push(option);
        }
      }

      const variationsArray = Object.keys(groupedOptions).map((varName) => ({
        name: varName,
        options: groupedOptions[varName],
      }));

      return {
        ...price,
        variations: variationsArray,
      };
    });

    return {
      ...product,
      totalQuantity,
      stocks,
      prices: formattedPrices,
    };
  });

  // إرجاع كل البيانات
  SuccessResponse(res, {
    warehouse,
    supplier,
    currency,
    tax,
    financial,
    products: formattedProducts,
  });
};

export const payInstallment = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { financial_id } = req.body;

  if (!financial_id) throw new BadRequest("financial_id is required");

  const installment = await PurchaseInstallmentModel.findById(id);
  if (!installment) throw new NotFound("Installment not found");

  if (installment.status === "paid")
    throw new BadRequest("Installment is already paid");

  const financial = await BankAccountModel.findById(financial_id);
  if (!financial) throw new NotFound("Financial account not found");

  // Create Invoice
  await PurchaseInvoiceModel.create({
    financial_id,
    amount: installment.amount,
    purchase_id: installment.purchase_id,
  });

  // Deduct from Balance
  if (financial) {
    (financial as any).balance -= installment.amount;
    await financial.save();
  }

  // Update Installment
  installment.status = "paid";
  await installment.save();

  SuccessResponse(res, {
    message: "Installment paid successfully",
    installment,
  });
};

function buildAvgCostUpdatePipeline(newQty: number, newCostTotal: number) {
  const fallbackUnitCost = newQty > 0 ? newCostTotal / newQty : 0;
  return [
    {
      $set: {
        cost: {
          $let: {
            vars: {
              oldQty: { $ifNull: ["$quantity", 0] },
              oldCost: { $ifNull: ["$cost", 0] },
            },
            in: {
              $cond: [
                { $lte: [{ $add: ["$$oldQty", newQty] }, 0] },
                fallbackUnitCost,
                {
                  $divide: [
                    {
                      $add: [
                        { $multiply: ["$$oldQty", "$$oldCost"] },
                        newCostTotal,
                      ],
                    },
                    { $add: ["$$oldQty", newQty] },
                  ],
                },
              ],
            },
          },
        },
        quantity: { $add: [{ $ifNull: ["$quantity", 0] }, newQty] },
      },
    },
  ];
}

export const createPurchase = async (req: Request, res: Response) => {
  const {
    date,
    warehouse_id,
    supplier_id,
    receipt_img,
    payment_status,
    exchange_rate,
    total,
    discount,
    shipping_cost,
    grand_total,
    tax_id,
    purchase_items = [],
    purchase_materials = [],
    financials = [],
    note,
    installments = [],
  } = req.body;
 
  let purchase_due_payment = req.body.purchase_due_payment || [];
 
  // ========== Validations ==========
  const existingWarehouse = await WarehouseModel.findById(warehouse_id);
  if (!existingWarehouse) throw new BadRequest("Warehouse not found");
 
  if (tax_id) {
    const existingTax = await TaxesModel.findById(tax_id);
    if (!existingTax) throw new BadRequest("Tax not found");
  }
 
  // ========== Payment Validation ==========
  const totalPaidNow = financials.reduce(
    (sum: number, f: any) => sum + Number(f.payment_amount || 0),
    0
  );
  let totalDuePayments = purchase_due_payment.reduce(
    (sum: number, d: any) => sum + Number(d.amount || 0),
    0
  );
  const totalInstallments = installments.reduce(
    (sum: number, i: any) => sum + Number(i.amount || 0),
    0
  );
 
  const getDefaultDueDate = () => {
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 30);
    return dueDate;
  };
 
  if (payment_status === "full") {
    if (totalPaidNow !== grand_total) {
      throw new BadRequest(
        `Full payment required. Expected: ${grand_total}, Received: ${totalPaidNow}`
      );
    }
    if (purchase_due_payment.length > 0 || installments.length > 0) {
      throw new BadRequest(
        "Full payment should not have due payments or installments"
      );
    }
  } else if (payment_status === "later") {
    if (totalPaidNow > 0) {
      throw new BadRequest("Later payment should not have immediate payments");
    }
    if (purchase_due_payment.length === 0 && installments.length === 0) {
      purchase_due_payment.push({
        amount: grand_total,
        date: getDefaultDueDate(),
      });
      totalDuePayments = grand_total;
    }
    const totalLaterPayments = totalDuePayments + totalInstallments;
    if (totalLaterPayments !== grand_total) {
      throw new BadRequest(
        `Due payments + installments must equal grand_total. Expected: ${grand_total}, Received: ${totalLaterPayments}`
      );
    }
  } else if (payment_status === "partial") {
    if (totalPaidNow <= 0) {
      throw new BadRequest("Partial payment requires immediate payment");
    }
    if (totalPaidNow >= grand_total) {
      throw new BadRequest(
        "Partial payment should be less than grand_total. Use 'full' status instead"
      );
    }
 
    const remaining = grand_total - totalPaidNow;
 
    if (installments.length > 0) {
      if (totalInstallments !== remaining) {
        throw new BadRequest(
          `Installments must equal remaining amount. Expected: ${remaining}, Received: ${totalInstallments}`
        );
      }
    } else if (purchase_due_payment.length === 0) {
      purchase_due_payment.push({
        amount: remaining,
        date: getDefaultDueDate(),
      });
      totalDuePayments = remaining;
    } else {
      if (totalDuePayments !== remaining) {
        throw new BadRequest(
          `Due payments must equal remaining amount. Expected: ${remaining}, Received: ${totalDuePayments}`
        );
      }
    }
  }
 
  // ========== Save Image ==========
  let imageUrl = receipt_img;
  if (receipt_img && receipt_img.startsWith("data:")) {
    imageUrl = await saveBase64Image(
      receipt_img,
      Date.now().toString(),
      req,
      "Purchases"
    );
  }
 
  // ========== Create Purchase ==========
  const purchase = await PurchaseModel.create({
    date,
    warehouse_id,
    supplier_id,
    receipt_img: imageUrl,
    payment_status,
    exchange_rate,
    total,
    discount,
    shipping_cost,
    grand_total,
    tax_id,
    note,
  });
 
  // ========== Process Products ==========
  for (const p of purchase_items) {
    let product_code = p.product_code;
    let category_id = p.category_id;
    let product_id = p.product_id;
 
    if (product_code) {
      const product_price = await ProductPriceModel.findOne({
        code: product_code,
      }).populate("productId");
      if (product_price) {
        const productDoc: any = product_price.productId;
        product_id = productDoc?._id;
        category_id = productDoc?.categoryId;
      }
    }
 
    const product = await ProductModel.findById(product_id);
    if (!product) throw new NotFound(`Product not found: ${product_id}`);
 
    if ((product as any).exp_ability) {
      const expiryDateValue = p.expiry_date || p.date_of_expiery;
      if (!expiryDateValue) {
        throw new BadRequest(
          `Expiry date is required for product: ${(product as any).name}`
        );
      }
      const expiryDate = new Date(expiryDateValue);
      const today = new Date();
      expiryDate.setHours(0, 0, 0, 0);
      today.setHours(0, 0, 0, 0);
      if (expiryDate < today) {
        throw new BadRequest(
          `Expiry date cannot be in the past for product: ${
            (product as any).name
          }`
        );
      }
    }
 
    let totalQuantity = Number(p.quantity) || 0;
    const hasVariations =
      p.variations && Array.isArray(p.variations) && p.variations.length > 0;
 
    if (hasVariations) {
      totalQuantity = p.variations.reduce(
        (sum: number, v: any) => sum + (Number(v.quantity) || 0),
        0
      );
    }
 
    // Track whether this is the warehouse's first time carrying this product
    // (used to bump WarehouseModel.number_of_products), done atomically.
    const existingPurchaseItem = await PurchaseItemModel.findOne({
      warehouse_id,
      product_id,
    });
 
    const purchaseItem = await PurchaseItemModel.create({
      date: p.date || date,
      warehouse_id,
      purchase_id: purchase._id,
      category_id,
      product_id,
      patch_number: p.patch_number,
      quantity: totalQuantity,
      unit_cost: p.unit_cost,
      subtotal: p.subtotal,
      discount_share: p.discount_share || 0,
      unit_cost_after_discount: p.unit_cost_after_discount || p.unit_cost,
      tax: p.tax || 0,
      item_type: "product",
      date_of_expiery: (product as any).exp_ability
        ? p.expiry_date || p.date_of_expiery
        : undefined,
    });
 
    if (!existingPurchaseItem) {
      await WarehouseModel.findByIdAndUpdate(warehouse_id, {
        $inc: { number_of_products: 1 },
      });
    }
 
    if (hasVariations) {
      // ---- Variation product: user enters cost PER VARIANT ----
      // Cost lives on ProductPriceModel per variant, NOT blended into the
      // parent Product — the product-level record only tracks total stock
      // across all its variants.
      for (const v of p.variations) {
        if (!v.product_price_id) {
          throw new BadRequest("product_price_id is required for variations");
        }
        if (v.unit_cost === undefined || v.unit_cost === null) {
          throw new BadRequest("unit_cost is required for each variation");
        }
 
        const productPrice = await ProductPriceModel.findById(
          v.product_price_id
        );
        if (!productPrice) {
          throw new NotFound(`ProductPrice not found: ${v.product_price_id}`);
        }
 
        const vQty = Number(v.quantity) || 0;
        const vUnitCost =
          Number(v.unit_cost_after_discount ?? v.unit_cost) || 0;
        const vCostTotal = vQty * vUnitCost;
 
        // Variant-level total stock + running weighted-average cost — one
        // atomic call via the aggregation-pipeline update above.
        await ProductPriceModel.findByIdAndUpdate(
          v.product_price_id,
          buildAvgCostUpdatePipeline(vQty, vCostTotal)
        );
 
        await PurchaseItemOptionModel.create({
          purchase_item_id: purchaseItem._id,
          product_price_id: v.product_price_id,
          option_id: v.option_id,
          quantity: vQty,
          unit_cost: v.unit_cost,
        });
 
        // ✅ Per-variant, per-warehouse stock — atomic upsert.
        // Requires a unique compound index on
        // { productId, productPriceId, warehouseId } in Product_Warehouse.
        await Product_WarehouseModel.findOneAndUpdate(
          {
            productId: product_id,
            productPriceId: v.product_price_id,
            warehouseId: warehouse_id,
          },
          { $inc: { quantity: vQty } },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
      }
 
      // Product-level total stock only — cost is NOT tracked here for
      // variation products; it lives per-variant on ProductPriceModel.
      await ProductModel.findByIdAndUpdate(product._id, {
        $inc: { quantity: totalQuantity },
      });
    } else {
      // ---- Simple product: no variant, cost lives on the Product itself ----
      const unitCost = Number(p.unit_cost_after_discount ?? p.unit_cost) || 0;
      const itemCostTotal = totalQuantity * unitCost;
 
      await Product_WarehouseModel.findOneAndUpdate(
        {
          productId: product_id,
          productPriceId: null,
          warehouseId: warehouse_id,
        },
        { $inc: { quantity: totalQuantity } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
 
      // Product-level total stock + running weighted-average cost — atomic.
      await ProductModel.findByIdAndUpdate(
        product._id,
        buildAvgCostUpdatePipeline(totalQuantity, itemCostTotal)
      );
    }
 
    // Category running total — atomic
    if ((product as any).categoryId) {
      await CategoryModel.findByIdAndUpdate((product as any).categoryId, {
        $inc: { product_quantity: totalQuantity },
      });
    }
 
    // Warehouse running total — atomic
    await WarehouseModel.findByIdAndUpdate(warehouse_id, {
      $inc: { stock_Quantity: totalQuantity },
    });
  }
 
  // ========== Process Materials ==========
  for (const m of purchase_materials) {
    const material = await MaterialModel.findById(m.material_id);
    if (!material) throw new NotFound(`Material not found: ${m.material_id}`);
 
    await PurchaseItemModel.create({
      date: m.date || date,
      warehouse_id,
      purchase_id: purchase._id,
      category_id: (material as any).category_id,
      material_id: m.material_id,
      patch_number: m.patch_number,
      quantity: m.quantity,
      unit_cost: m.unit_cost,
      subtotal: m.subtotal,
      discount_share: m.discount_share || 0,
      unit_cost_after_discount: m.unit_cost_after_discount || m.unit_cost,
      tax: m.tax || 0,
      item_type: "material",
    });
 
    const mQty = Number(m.quantity) || 0;
 
    await MaterialModel.findByIdAndUpdate(m.material_id, {
      $inc: { quantity: mQty },
    });
 
    await WarehouseModel.findByIdAndUpdate(warehouse_id, {
      $inc: { stock_Quantity: mQty },
    });
  }
 
  // ========== Create Invoices (الدفع الفوري) ==========
  if (financials && Array.isArray(financials) && financials.length > 0) {
    for (const ele of financials) {
      await PurchaseInvoiceModel.create({
        financial_id: ele.financial_id,
        amount: Number(ele.payment_amount) || 0,
        purchase_id: purchase._id,
      });
 
      await BankAccountModel.findByIdAndUpdate(ele.financial_id, {
        $inc: { balance: -(Number(ele.payment_amount) || 0) },
      });
    }
  }
 
  // ========== Create Due Payments (الدفع اللاحق) ==========
  if (
    purchase_due_payment &&
    Array.isArray(purchase_due_payment) &&
    purchase_due_payment.length > 0
  ) {
    for (const due_payment of purchase_due_payment) {
      await PurchaseDuePaymentModel.create({
        purchase_id: purchase._id,
        amount: due_payment.amount,
        date: due_payment.date,
      });
    }
  }
 
  // ========== Create Installments (التقسيط) ==========
  if (installments && Array.isArray(installments) && installments.length > 0) {
    for (const inst of installments) {
      await PurchaseInstallmentModel.create({
        purchase_id: purchase._id,
        amount: inst.amount,
        date: inst.date,
        status: "pending",
      });
    }
  }
 
  // ========== Get Full Purchase ==========
  // NOTE: because ProductModel/ProductPriceModel were updated with the new
  // weighted-average `cost` above, this populate automatically returns the
  // up-to-date average cost per product and per variant — no extra work
  // needed to "show" it to the caller.
  const fullPurchase = await PurchaseModel.findById(purchase._id)
    .populate({
      path: "items",
      populate: [
        { path: "product_id" },
        { path: "material_id" },
        { path: "category_id" },
        {
          path: "options",
          populate: [{ path: "product_price_id" }, { path: "option_id" }],
        },
      ],
    })
    .populate("warehouse_id")
    .populate("supplier_id")
    .populate("tax_id")
    .populate("invoices")
    .populate("duePayments")
    .populate("installments");
 
  SuccessResponse(res, {
    message: "Purchase created successfully",
    purchase: fullPurchase,
  });
};

export const updatePurchase = async (req: Request, res: Response) => {
  const { id } = req.params;
  const {
    date,
    warehouse_id,
    supplier_id,
    receipt_img,
    payment_status,
    exchange_rate,
    total,
    discount,
    shipping_cost,
    grand_total,
    tax_id,
    note,
    purchase_items = [],
    purchase_materials = [],
    financials = [],
    purchase_due_payment = [],
    installments = [],
  } = req.body;
 
  const existingPurchase = await PurchaseModel.findById(id);
  if (!existingPurchase) throw new NotFound("Purchase not found");
 
  // ========== Validations ==========
  if (warehouse_id) {
    const existingWarehouse = await WarehouseModel.findById(warehouse_id);
    if (!existingWarehouse) throw new BadRequest("Warehouse not found");
  }
 
  if (supplier_id) {
    const existingSupplier = await SupplierModel.findById(supplier_id);
    if (!existingSupplier) throw new BadRequest("Supplier not found");
  }
 
  if (tax_id) {
    const existingTax = await TaxesModel.findById(tax_id);
    if (!existingTax) throw new BadRequest("Tax not found");
  }
 
  // ========== Payment Validation ==========
  const finalGrandTotal = grand_total ?? (existingPurchase as any).grand_total;
  const finalPaymentStatus =
    payment_status ?? (existingPurchase as any).payment_status;
 
  const totalPaidNow = financials.reduce(
    (sum: number, f: any) => sum + Number(f.payment_amount || 0),
    0
  );
 
  const totalDuePayments = purchase_due_payment.reduce(
    (sum: number, d: any) => sum + Number(d.amount || 0),
    0
  );
  const totalInstallments = installments.reduce(
    (sum: number, i: any) => sum + Number(i.amount || 0),
    0
  );
  const totalPayments = totalPaidNow + totalDuePayments + totalInstallments;
 
  if (finalPaymentStatus === "full") {
    if (totalPaidNow !== finalGrandTotal) {
      throw new BadRequest(
        `Full payment required. Expected: ${finalGrandTotal}, Received: ${totalPaidNow}`
      );
    }
    if (purchase_due_payment.length > 0 || installments.length > 0) {
      throw new BadRequest(
        "Full payment should not have due payments or installments"
      );
    }
  } else if (finalPaymentStatus === "later") {
    if (totalPaidNow > 0) {
      throw new BadRequest("Later payment should not have immediate payments");
    }
    if (totalDuePayments !== finalGrandTotal) {
      throw new BadRequest(
        `Due payments must equal grand_total. Expected: ${finalGrandTotal}, Received: ${totalDuePayments}`
      );
    }
  } else if (finalPaymentStatus === "partial") {
    if (totalPaidNow <= 0) {
      throw new BadRequest("Partial payment requires immediate payment");
    }
    if (totalPaidNow >= finalGrandTotal) {
      throw new BadRequest(
        "Partial payment should be less than grand_total. Use 'full' status instead"
      );
    }
    if (totalPayments !== finalGrandTotal) {
      throw new BadRequest(
        `Total payments must equal grand_total. Expected: ${finalGrandTotal}, Received: ${totalPayments}`
      );
    }
  }
 
  // ========== Save Image ==========
  let imageUrl = receipt_img;
  if (receipt_img && receipt_img.startsWith("data:")) {
    imageUrl = await saveBase64Image(
      receipt_img,
      Date.now().toString(),
      req,
      "Purchases"
    );
  }
 
  // ========== Resolve + validate ALL new items BEFORE touching old data ==========
  // No replica set => no multi-document transactions. Validating everything up
  // front (product/material/variant existence, expiry rules, per-variant cost)
  // shrinks the window in which a mid-function failure leaves old stock
  // reversed/deleted but new stock only partially re-applied. It does not
  // fully eliminate that window — a crash between the reversal block and the
  // re-apply block below is still possible and would need a reconciliation
  // pass to detect.
  const targetWarehouseId =
    warehouse_id ?? (existingPurchase as any).warehouse_id;
 
  const resolvedItems: Array<{
    product: any;
    product_id: any;
    category_id: any;
    totalQuantity: number;
    hasVariations: boolean;
    variations: Array<{
      product_price_id: any;
      option_id: any;
      quantity: number;
      unit_cost: number;
      costTotal: number;
    }>;
    itemCostTotal: number;
    raw: any;
  }> = [];
 
  for (const p of purchase_items) {
    let category_id = p.category_id;
    let product_id = p.product_id;
 
    if (p.product_code) {
      const product_price = await ProductPriceModel.findOne({
        code: p.product_code,
      }).populate("productId");
      if (product_price) {
        const productDoc: any = product_price.productId;
        product_id = productDoc?._id;
        category_id = productDoc?.categoryId;
      }
    }
 
    const product = await ProductModel.findById(product_id);
    if (!product) throw new NotFound(`Product not found: ${product_id}`);
 
    // Keep the category used for the PurchaseItem record and the category
    // actually incremented in sync — previously these could diverge.
    if (!category_id) category_id = (product as any).categoryId;
 
    if ((product as any).exp_ability) {
      const expiryDateValue = p.expiry_date || p.date_of_expiery;
      if (!expiryDateValue) {
        throw new BadRequest(
          `Expiry date is required for product: ${(product as any).name}`
        );
      }
      const expiryDate = new Date(expiryDateValue);
      const today = new Date();
      expiryDate.setHours(0, 0, 0, 0);
      today.setHours(0, 0, 0, 0);
      if (expiryDate < today) {
        throw new BadRequest(
          `Expiry date cannot be in the past for product: ${
            (product as any).name
          }`
        );
      }
    }
 
    const hasVariations =
      p.variations && Array.isArray(p.variations) && p.variations.length > 0;
 
    let totalQuantity = p.quantity ?? 0;
    let itemCostTotal = 0;
    const variations: Array<{
      product_price_id: any;
      option_id: any;
      quantity: number;
      unit_cost: number;
      costTotal: number;
    }> = [];
 
    if (hasVariations) {
      totalQuantity = 0;
      for (const v of p.variations) {
        if (!v.product_price_id) {
          throw new BadRequest("product_price_id is required for variations");
        }
        if (v.unit_cost === undefined || v.unit_cost === null) {
          throw new BadRequest("unit_cost is required for each variation");
        }
        const productPrice = await ProductPriceModel.findById(
          v.product_price_id
        );
        if (!productPrice) {
          throw new NotFound(`ProductPrice not found: ${v.product_price_id}`);
        }
        const qty = v.quantity ?? 0;
        const unitCost = Number(v.unit_cost_after_discount ?? v.unit_cost) || 0;
        const costTotal = qty * unitCost;
        totalQuantity += qty;
        // NOTE: not added to itemCostTotal — cost for variation products
        // lives per-variant on ProductPriceModel, not blended into the
        // parent Product's cost.
        variations.push({
          product_price_id: v.product_price_id,
          option_id: v.option_id,
          quantity: qty,
          unit_cost: v.unit_cost,
          costTotal,
        });
      }
    } else {
      const unitCost = Number(p.unit_cost_after_discount ?? p.unit_cost) || 0;
      itemCostTotal = totalQuantity * unitCost;
    }
 
    resolvedItems.push({
      product,
      product_id,
      category_id,
      totalQuantity,
      hasVariations,
      variations,
      itemCostTotal,
      raw: p,
    });
  }
 
  for (const m of purchase_materials) {
    const material = await MaterialModel.findById(m.material_id);
    if (!material) throw new NotFound(`Material not found: ${m.material_id}`);
  }
 
  // ========== Reverse Old Items (atomic) ==========
  // NOTE: this only reverses QUANTITY, not cost. Weighted-average cost is
  // cumulative/blended, so cleanly "unmixing" one past purchase's contribution
  // out of the running average isn't possible without a full per-lot cost
  // history — out of scope here. The average will re-settle as new purchases
  // come in; it just won't retroactively un-average this edit.
  const oldItems = await PurchaseItemModel.find({ purchase_id: id });
 
  for (const item of oldItems) {
    const itemData = item as any;
 
    if (itemData.item_type === "product" && itemData.product_id) {
      await ProductModel.findByIdAndUpdate(itemData.product_id, {
        $inc: { quantity: -itemData.quantity },
      });
 
      if (itemData.category_id) {
        await CategoryModel.findByIdAndUpdate(itemData.category_id, {
          $inc: { product_quantity: -itemData.quantity },
        });
      }
 
      const oldOptions = await PurchaseItemOptionModel.find({
        purchase_item_id: itemData._id,
      });
 
      if (oldOptions.length > 0) {
        // Variant item — reverse EACH variant's own Product_Warehouse row.
        // (Previously this looked up a single row with no productPriceId
        // filter, which could hit an arbitrary variant's row instead.)
        for (const opt of oldOptions) {
          const optData = opt as any;
          if (optData.product_price_id) {
            await ProductPriceModel.findByIdAndUpdate(
              optData.product_price_id,
              { $inc: { quantity: -optData.quantity } }
            );
            await Product_WarehouseModel.findOneAndUpdate(
              {
                productId: itemData.product_id,
                productPriceId: optData.product_price_id,
                warehouseId: itemData.warehouse_id,
              },
              { $inc: { quantity: -optData.quantity } }
            );
          }
        }
      } else {
        // Simple product — reverse the base (productPriceId: null) row.
        await Product_WarehouseModel.findOneAndUpdate(
          {
            productId: itemData.product_id,
            productPriceId: null,
            warehouseId: itemData.warehouse_id,
          },
          { $inc: { quantity: -itemData.quantity } }
        );
      }
 
      await PurchaseItemOptionModel.deleteMany({
        purchase_item_id: itemData._id,
      });
    }
 
    if (itemData.item_type === "material" && itemData.material_id) {
      await MaterialModel.findByIdAndUpdate(itemData.material_id, {
        $inc: { quantity: -itemData.quantity },
      });
    }
  }
 
  // Reverse old warehouse total — single atomic decrement instead of
  // fetch-then-.save() on WarehouseModel.
  const totalOldQty = oldItems.reduce(
    (sum, item) => sum + (item as any).quantity,
    0
  );
  if ((existingPurchase as any).warehouse_id) {
    await WarehouseModel.findByIdAndUpdate(
      (existingPurchase as any).warehouse_id,
      { $inc: { stock_Quantity: -totalOldQty } }
    );
  }
 
  // Delete old items
  await PurchaseItemModel.deleteMany({ purchase_id: id });
 
  // Delete old invoices and restore balance
  const oldInvoices = await PurchaseInvoiceModel.find({ purchase_id: id });
  for (const inv of oldInvoices) {
    const invData = inv as any;
    if (invData.financial_id) {
      await BankAccountModel.findByIdAndUpdate(invData.financial_id, {
        $inc: { balance: invData.amount },
      });
    }
  }
  await PurchaseInvoiceModel.deleteMany({ purchase_id: id });
 
  // Delete old due payments
  await PurchaseDuePaymentModel.deleteMany({ purchase_id: id });
 
  // Delete old installments
  await PurchaseInstallmentModel.deleteMany({ purchase_id: id });
 
  // ========== Update Purchase ==========
  if (date) (existingPurchase as any).date = date;
  if (warehouse_id) (existingPurchase as any).warehouse_id = warehouse_id;
  if (supplier_id) (existingPurchase as any).supplier_id = supplier_id;
  (existingPurchase as any).receipt_img =
    imageUrl ?? (existingPurchase as any).receipt_img;
  (existingPurchase as any).payment_status = finalPaymentStatus;
  (existingPurchase as any).exchange_rate =
    exchange_rate ?? (existingPurchase as any).exchange_rate;
  (existingPurchase as any).total = total ?? (existingPurchase as any).total;
  (existingPurchase as any).discount =
    discount ?? (existingPurchase as any).discount;
  (existingPurchase as any).shipping_cost =
    shipping_cost ?? (existingPurchase as any).shipping_cost;
  (existingPurchase as any).grand_total = finalGrandTotal;
  if (tax_id !== undefined) (existingPurchase as any).tax_id = tax_id || null;
  if (note !== undefined) (existingPurchase as any).note = note;
 
  await existingPurchase.save();
 
  // ========== Process New Products (atomic, already validated above) ==========
  for (const resolved of resolvedItems) {
    const {
      product,
      product_id,
      category_id,
      totalQuantity,
      hasVariations,
      variations,
      itemCostTotal,
      raw: p,
    } = resolved;
 
    const purchaseItem = await PurchaseItemModel.create({
      date: p.date || (existingPurchase as any).date,
      warehouse_id: targetWarehouseId,
      purchase_id: existingPurchase._id,
      category_id,
      product_id,
      patch_number: p.patch_number,
      quantity: totalQuantity,
      unit_cost: p.unit_cost,
      subtotal: p.subtotal,
      discount_share: p.discount_share || 0,
      unit_cost_after_discount: p.unit_cost_after_discount || p.unit_cost,
      tax: p.tax || 0,
      item_type: "product",
      date_of_expiery: (product as any).exp_ability
        ? p.expiry_date || p.date_of_expiery
        : undefined,
    });
 
    if (hasVariations) {
      for (const v of variations) {
        // Per-variant stock + running weighted-average cost — atomic.
        await ProductPriceModel.findByIdAndUpdate(
          v.product_price_id,
          buildAvgCostUpdatePipeline(v.quantity, v.costTotal)
        );
 
        await PurchaseItemOptionModel.create({
          purchase_item_id: purchaseItem._id,
          product_price_id: v.product_price_id,
          option_id: v.option_id,
          quantity: v.quantity,
          unit_cost: v.unit_cost,
        });
 
        await Product_WarehouseModel.findOneAndUpdate(
          {
            productId: product_id,
            productPriceId: v.product_price_id,
            warehouseId: targetWarehouseId,
          },
          { $inc: { quantity: v.quantity } },
          { upsert: true, new: true }
        );
      }
 
      // Product-level total stock only — cost stays on ProductPriceModel
      // per variant, not blended here.
      await ProductModel.findByIdAndUpdate(product_id, {
        $inc: { quantity: totalQuantity },
      });
    } else {
      await Product_WarehouseModel.findOneAndUpdate(
        {
          productId: product_id,
          productPriceId: null,
          warehouseId: targetWarehouseId,
        },
        { $inc: { quantity: totalQuantity } },
        { upsert: true, new: true }
      );
 
      // Product-level stock + running weighted-average cost — atomic.
      await ProductModel.findByIdAndUpdate(
        product_id,
        buildAvgCostUpdatePipeline(totalQuantity, itemCostTotal)
      );
    }
 
    if (category_id) {
      await CategoryModel.findByIdAndUpdate(category_id, {
        $inc: { product_quantity: totalQuantity },
      });
    }
 
    await WarehouseModel.findByIdAndUpdate(targetWarehouseId, {
      $inc: { stock_Quantity: totalQuantity },
    });
  }
 
  // ========== Process New Materials ==========
  for (const m of purchase_materials) {
    const material = await MaterialModel.findById(m.material_id);
    if (!material) throw new NotFound(`Material not found: ${m.material_id}`);
 
    await PurchaseItemModel.create({
      date: m.date || (existingPurchase as any).date,
      warehouse_id: targetWarehouseId,
      purchase_id: existingPurchase._id,
      category_id: (material as any).category_id,
      material_id: m.material_id,
      patch_number: m.patch_number,
      quantity: m.quantity,
      unit_cost: m.unit_cost,
      subtotal: m.subtotal,
      discount_share: m.discount_share || 0,
      unit_cost_after_discount: m.unit_cost_after_discount || m.unit_cost,
      tax: m.tax || 0,
      item_type: "material",
    });
 
    await MaterialModel.findByIdAndUpdate(m.material_id, {
      $inc: { quantity: m.quantity ?? 0 },
    });
 
    await WarehouseModel.findByIdAndUpdate(targetWarehouseId, {
      $inc: { stock_Quantity: m.quantity ?? 0 },
    });
  }
 
  // ========== Create New Invoices ==========
  for (const ele of financials) {
    await PurchaseInvoiceModel.create({
      financial_id: ele.financial_id,
      amount: ele.payment_amount,
      purchase_id: existingPurchase._id,
    });
 
    await BankAccountModel.findByIdAndUpdate(ele.financial_id, {
      $inc: { balance: -ele.payment_amount },
    });
  }
 
  // ========== Create New Due Payments ==========
  for (const due_payment of purchase_due_payment) {
    await PurchaseDuePaymentModel.create({
      purchase_id: existingPurchase._id,
      amount: due_payment.amount,
      date: due_payment.date,
    });
  }
 
  // ========== Create New Installments ==========
  for (const inst of installments) {
    await PurchaseInstallmentModel.create({
      purchase_id: existingPurchase._id,
      amount: inst.amount,
      date: inst.date,
      status: "pending",
    });
  }
 
  const fullPurchase = await PurchaseModel.findById(existingPurchase._id)
    .populate({
      path: "items",
      populate: [
        { path: "product_id" },
        { path: "material_id" },
        { path: "category_id" },
        {
          path: "options",
          populate: [{ path: "product_price_id" }, { path: "option_id" }],
        },
      ],
    })
    .populate("warehouse_id")
    .populate("supplier_id")
    .populate("tax_id")
    .populate("invoices")
    .populate("duePayments")
    .populate("installments");
 
  SuccessResponse(res, {
    message: "Purchase updated successfully",
    purchase: fullPurchase,
  });
};