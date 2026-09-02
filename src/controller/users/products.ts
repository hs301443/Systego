import { Request, Response } from "express";
import mongoose from "mongoose";
import asyncHandler from "express-async-handler";
import { WarehouseModel } from "../../models/schema/admin/Warehouse";
import { CustomerModel } from "../../models/schema/admin/POS/customer";
import { Product_WarehouseModel } from "../../models/schema/admin/Product_Warehouse";
import { ProductModel } from "../../models/schema/admin/products";
import { SuccessResponse } from "../../utils/response";
import { NotFound } from "../../Errors/NotFound";
import { DiscountModel } from "../../models/schema/admin/Discount";

const buildProductAggregationPipeline = (
  productMatchStage: object,
  wishlistIds: mongoose.Types.ObjectId[],
  onlineWarehouseIds: mongoose.Types.ObjectId[]
): mongoose.PipelineStage[] => {
  return [
    { $match: { ...productMatchStage, Is_Online: true } },

    // Stock, scoped to online warehouses only, grouped per variant.
    // Left join — products with no matching rows keep an empty array
    // and fall through to quantity: 0 below, instead of disappearing.
    {
      $lookup: {
        from: "product_warehouses", // ⚠️ confirm actual collection name against Product_WarehouseModel
        let: { pid: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ["$productId", "$$pid"] },
              warehouseId: { $in: onlineWarehouseIds },
            },
          },
          {
            $group: {
              _id: "$productPriceId",
              quantity: { $sum: "$quantity" },
            },
          },
        ],
        as: "variantStocksRaw",
      },
    },
    {
      $addFields: {
        totalQuantity: { $sum: "$variantStocksRaw.quantity" },
        variantStocks: {
          $map: {
            input: "$variantStocksRaw",
            as: "vs",
            in: { productPriceId: "$$vs._id", quantity: "$$vs.quantity" },
          },
        },
      },
    },

    // 1️⃣ Brand
    {
      $lookup: {
        from: "brands",
        localField: "brandId",
        foreignField: "_id",
        as: "brandData",
      },
    },
    { $unwind: { path: "$brandData", preserveNullAndEmptyArrays: true } },

    // Category — must be online too
    // Category — must be online too, and a product can belong to multiple
    {
      $lookup: {
        from: "categories",
        localField: "categoryId",
        foreignField: "_id",
        as: "categoryData",
      },
    },
    {
      $addFields: {
        categoryData: {
          $filter: {
            input: "$categoryData",
            as: "c",
            cond: { $eq: ["$$c.Is_Online", true] },
          },
        },
      },
    },
    // Only keep products with at least one online category left
    { $match: { "categoryData.0": { $exists: true } } },

    // 2️⃣ Discount
    {
      $lookup: {
        from: "discounts",
        localField: "discountId",
        foreignField: "_id",
        as: "discountData",
      },
    },
    { $unwind: { path: "$discountData", preserveNullAndEmptyArrays: true } },

    // 3️⃣ A discount only counts as active if status is true AND it's
    // scoped to E-commerce — previously this just checked existence,
    // so disabled or POS-only discounts were still applied online.
    // ⚠️ Field names ("status", "applyIn") and the value "E-commerce"
    // are inferred from the original comment — confirm against the
    // actual DiscountModel schema before relying on this.
    {
      $addFields: {
        activeDiscount: {
          $cond: {
            if: {
              $and: [
                { $gt: ["$discountData", null] },
                { $eq: ["$discountData.status", true] },
                { $eq: ["$discountData.applyIn", "E-commerce"] },
              ],
            },
            then: "$discountData",
            else: null,
          },
        },
      },
    },

    {
      $lookup: {
        from: "productprices",
        localField: "_id",
        foreignField: "productId",
        as: "prices",
      },
    },
    {
      $lookup: {
        from: "productpriceoptions",
        localField: "prices._id",
        foreignField: "product_price_id",
        as: "priceOptions",
      },
    },
    {
      $lookup: {
        from: "options",
        localField: "priceOptions.option_id",
        foreignField: "_id",
        as: "rawOptions",
      },
    },
    {
      $lookup: {
        from: "variations",
        localField: "rawOptions.variationId",
        foreignField: "_id",
        as: "rawVariations",
      },
    },

    {
      $project: {
        _id: 1,
        name: "$name",
        ar_name: "$ar_name",
        description: "$description",
        image: "$image",
        gallery_product: "$gallery_product",
        main_price: "$price",

        // 4️⃣ Discounted price for the main price
        final_price: {
          $cond: {
            if: { $gt: ["$activeDiscount", null] },
            then: {
              $cond: {
                if: { $eq: ["$activeDiscount.type", "percentage"] },
                then: {
                  $max: [
                    {
                      $subtract: [
                        "$price",
                        { $multiply: ["$price", "$activeDiscount.amount"] },
                      ],
                    },
                    0,
                  ],
                },
                else: {
                  $max: [
                    { $subtract: ["$price", "$activeDiscount.amount"] },
                    0,
                  ],
                },
              },
            },
            else: "$price",
          },
        },

        discount: {
          $cond: {
            if: { $gt: ["$activeDiscount", null] },
            then: {
              _id: "$activeDiscount._id",
              name: "$activeDiscount.name",
              type: "$activeDiscount.type",
              amount: "$activeDiscount.amount",
            },
            else: null,
          },
        },

        // Defaults to 0 for products with no stock rows in any online
        // warehouse — they're still shown, not dropped. Add
        // `{ $match: { totalQuantity: { $gt: 0 } } }` after this stage
        // if out-of-stock products should be hidden instead.
        quantity: "$totalQuantity",
        is_favorite: { $in: ["$_id", wishlistIds] },
        categories: {
          $map: {
            input: "$categoryData",
            as: "c",
            in: { _id: "$$c._id", name: "$$c.name", ar_name: "$$c.ar_name" },
          },
        },

        brand: {
          $cond: {
            if: { $gt: ["$brandData", null] },
            then: {
              _id: "$brandData._id",
              name: "$brandData.name",
              ar_name: "$brandData.ar_name",
            },
            else: null,
          },
        },

        variations: {
          $map: {
            input: "$rawVariations",
            as: "v",
            in: {
              _id: "$$v._id",
              name: "$$v.name",
              ar_name: "$$v.ar_name",
              options: {
                $filter: {
                  input: "$rawOptions",
                  as: "o",
                  cond: { $eq: ["$$o.variationId", "$$v._id"] },
                },
              },
            },
          },
        },
        skus: {
          $map: {
            input: "$prices",
            as: "price",
            in: {
              _id: "$$price._id",
              price: "$$price.price",

              // 5️⃣ Discounted price per SKU
              final_price: {
                $cond: {
                  if: { $gt: ["$activeDiscount", null] },
                  then: {
                    $cond: {
                      if: { $eq: ["$activeDiscount.type", "percentage"] },
                      then: {
                        $max: [
                          {
                            $subtract: [
                              "$$price.price",
                              {
                                $multiply: [
                                  "$$price.price",
                                  "$activeDiscount.amount",
                                ],
                              },
                            ],
                          },
                          0,
                        ],
                      },
                      else: {
                        $max: [
                          {
                            $subtract: [
                              "$$price.price",
                              "$activeDiscount.amount",
                            ],
                          },
                          0,
                        ],
                      },
                    },
                  },
                  else: "$$price.price",
                },
              },

              code: "$$price.code",
              gallery: "$$price.gallery",
              // Also defaults to 0 rather than being absent when a
              // variant has no stock in any online warehouse.
              quantity: {
                $let: {
                  vars: {
                    stockObj: {
                      $arrayElemAt: [
                        {
                          $filter: {
                            input: "$variantStocks",
                            as: "vs",
                            cond: {
                              $eq: ["$$vs.productPriceId", "$$price._id"],
                            },
                          },
                        },
                        0,
                      ],
                    },
                  },
                  in: { $ifNull: ["$$stockObj.quantity", 0] },
                },
              },
              option_ids: {
                $map: {
                  input: {
                    $filter: {
                      input: "$priceOptions",
                      as: "po",
                      cond: { $eq: ["$$po.product_price_id", "$$price._id"] },
                    },
                  },
                  as: "filteredPo",
                  in: "$$filteredPo.option_id",
                },
              },
            },
          },
        },
        created_at: "$createdAt",
      },
    },
  ];
};

// 🌟 Get All Products
export const getAllProducts = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const onlineWarehouses = await WarehouseModel.find({ Is_Online: true })
      .select("_id")
      .lean();
    const onlineWarehouseIds = onlineWarehouses.map((w) => w._id);

    let wishlistIds: mongoose.Types.ObjectId[] = [];
    if (req.user?.id) {
      const user = await CustomerModel.findById(req.user.id)
        .select("wishlist")
        .lean();
      if (user?.wishlist) {
        wishlistIds = user.wishlist.map(
          (id) => new mongoose.Types.ObjectId(id.toString())
        );
      }
    }

    // No warehouse-membership match here anymore — Is_Online is applied
    // inside buildProductAggregationPipeline, and stock is left-joined
    // rather than required for a product to appear.
    const pipeline = buildProductAggregationPipeline(
      {},
      wishlistIds,
      onlineWarehouseIds
    );

    pipeline.push({ $sort: { created_at: -1 } });

    const productsWithStatus = await ProductModel.aggregate(pipeline);

    return SuccessResponse(
      res,
      {
        message: "All products retrieved successfully",
        data: productsWithStatus,
      },
      200
    );
  }
);

// 🌟 Get Single Product By ID
export const getProductById = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new NotFound("Product ID is invalid");
    }

    const onlineWarehouses = await WarehouseModel.find({ Is_Online: true })
      .select("_id")
      .lean();
    const onlineWarehouseIds = onlineWarehouses.map((w) => w._id);

    let wishlistIds: mongoose.Types.ObjectId[] = [];
    if (req.user?.id) {
      const user = await CustomerModel.findById(req.user.id)
        .select("wishlist")
        .lean();
      if (user?.wishlist) {
        wishlistIds = user.wishlist.map(
          (wId) => new mongoose.Types.ObjectId(wId.toString())
        );
      }
    }

    const pipeline = buildProductAggregationPipeline(
      { _id: new mongoose.Types.ObjectId(id) },
      wishlistIds,
      onlineWarehouseIds
    );

    const product = await ProductModel.aggregate(pipeline);

    if (!product || product.length === 0) {
      throw new NotFound("Product not found");
    }

    return SuccessResponse(
      res,
      {
        message: "Product retrieved successfully",
        data: product[0],
      },
      200
    );
  }
);
