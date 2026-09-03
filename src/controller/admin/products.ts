import { Request, Response } from "express";
import mongoose from "mongoose";
import { ProductModel } from "../../models/schema/admin/products";
import { ProductPriceModel } from "../../models/schema/admin/product_price";
import { ProductPriceOptionModel } from "../../models/schema/admin/product_price";
import { SuccessResponse } from "../../utils/response";
import { BadRequest } from "../../Errors/BadRequest";
import { NotFound } from "../../Errors/NotFound";
import { saveBase64Image } from "../../utils/handleImages";
import {
  generateBarcodeImage,
  generateEAN13Barcode,
} from "../../utils/barcode";
import { CategoryModel } from "../../models/schema/admin/category";
import { BrandModel } from "../../models/schema/admin/brand";
import { VariationModel } from "../../models/schema/admin/Variation";
import { WarehouseModel } from "../../models/schema/admin/Warehouse";
import { PurchaseItemModel } from "../../models/schema/admin/purchase_item";
import ExcelJS from "exceljs";
import { UnitModel } from "../../models/schema/admin/units";
import { TaxesModel } from "../../models/schema/admin/Taxes";
import { Product_WarehouseModel } from "../../models/schema/admin/Product_Warehouse";
import { DiscountModel } from "../../models/schema/admin/Discount";

export const createProduct = async (req: Request, res: Response) => {
  const {
    name,
    ar_name,
    image,
    categoryId,
    brandId,
    discountId,
    product_unit,
    sale_unit,
    purchase_unit,
    price,
    ar_description,
    description,
    exp_ability,
    minimum_quantity_sale,
    low_stock,
    cost,
    whole_price,
    free_shipping,
    taxesId,
    product_has_imei,
    different_price,
    show_quantity,
    maximum_to_show,
    prices,
    gallery_product,
    is_featured,
    code,
    Is_Online,
    // بيانات المخزن
    warehouseId,
  } = req.body;

  if (!name) throw new BadRequest("Product name is required");
  if (!ar_name) throw new BadRequest("Arabic name is required");
  if (!ar_description) throw new BadRequest("Arabic description is required");

  const hasVariations = Array.isArray(prices) && prices.length > 0;

  if (!hasVariations) {
    if (price === undefined || price === null) {
      throw new BadRequest(
        "Product price is required when there are no variations"
      );
    }
    if (!code) {
      throw new BadRequest(
        "Product code is required when there are no variations"
      );
    }

    const existingProductWithCode = await ProductModel.findOne({ code });
    if (existingProductWithCode) {
      throw new BadRequest("Product code already exists");
    }
  }

  if (!Array.isArray(categoryId) || categoryId.length === 0) {
    throw new BadRequest("At least one categoryId is required");
  }

  const existingCategories = await CategoryModel.find({
    _id: { $in: categoryId },
  });
  if (existingCategories.length !== categoryId.length) {
    throw new BadRequest("One or more categories not found");
  }

  if (brandId) {
    const existingBrand = await BrandModel.findById(brandId);
    if (!existingBrand) throw new BadRequest("Brand not found");
  }

  if (discountId) {
    const existingDiscount = await DiscountModel.findById(discountId);
    if (!existingDiscount) throw new BadRequest("Discount not found");
  }

  // Check warehouse if provided
  if (warehouseId) {
    const warehouse = await WarehouseModel.findById(warehouseId);
    if (!warehouse) throw new BadRequest("Warehouse not found");
  }

  for (const cat of existingCategories) {
    cat.product_quantity += 1;
    await cat.save();
  }

  let imageUrl: string | undefined;
  if (image) {
    imageUrl = await saveBase64Image(
      image,
      Date.now().toString(),
      req,
      "products"
    );
  }

  let galleryUrls: string[] = [];
  if (gallery_product && Array.isArray(gallery_product)) {
    for (const g of gallery_product) {
      if (typeof g === "string") {
        const imgUrl = await saveBase64Image(
          g,
          Date.now().toString(),
          req,
          "products"
        );
        galleryUrls.push(imgUrl);
      }
    }
  }

  if (show_quantity && !maximum_to_show) {
    throw new BadRequest(
      "Maximum to show is required when show_quantity is true"
    );
  }

  const basePrice = hasVariations ? 0 : Number(price);

  const product = await ProductModel.create({
    name,
    ar_name,
    ar_description,
    image: imageUrl,
    categoryId,
    brandId,
    discountId,
    product_unit,
    sale_unit,
    purchase_unit,
    code,
    price: basePrice,
    description,
    cost,
    exp_ability,
    minimum_quantity_sale,
    low_stock,
    whole_price,
    taxesId,
    product_has_imei,
    different_price,
    show_quantity,
    maximum_to_show,
    gallery_product: galleryUrls,
    is_featured,
    free_shipping,
    Is_Online,
    quantity: 0, // ✅ always starts at 0 — purchase is the only source of real stock
  });

  // ========== Simple product: seed Product_Warehouse at 0 ==========
  let stock = null;
  if (warehouseId && !hasVariations) {
    stock = await Product_WarehouseModel.create({
      productId: product._id,
      productPriceId: null, // ✅ explicit, not relied on as "missing"
      warehouseId,
      quantity: 0,
      low_stock: low_stock || 0,
    });

    await WarehouseModel.findByIdAndUpdate(warehouseId, {
      $inc: {
        number_of_products: 1,
        stock_Quantity: 0,
      },
    });
  }

  // ========== Variation product ==========
  if (hasVariations) {
    let minVariantPrice: number | null = null;
    let variantIndex = 0;

    for (const p of prices) {
      if (p.price === undefined || p.price === null) {
        throw new BadRequest("Each variation must have a price");
      }
      if (!p.code) {
        throw new BadRequest("Each variation must have a unique code");
      }

      const variantPrice = Number(p.price);
      const variantCost = Number(p.cost || 0);

      let priceGalleryUrls: string[] = [];
      if (p.gallery && Array.isArray(p.gallery)) {
        for (const g of p.gallery) {
          if (typeof g === "string") {
            const gUrl = await saveBase64Image(
              g,
              Date.now().toString(),
              req,
              "product_gallery"
            );
            priceGalleryUrls.push(gUrl);
          }
        }
      }

      const productPrice = await ProductPriceModel.create({
        productId: product._id,
        price: variantPrice,
        code: p.code,
        gallery: priceGalleryUrls,
        quantity: 0, // ✅ always 0 at creation — purchase is the only source of real stock
        cost: variantCost,
        // strat_quantaty kept as a display/reference-only field if you still
        // want it; it must never be summed into real stock math anywhere.
        strat_quantaty: Number(p.strat_quantaty || 0),
      });

      if (minVariantPrice === null || variantPrice < minVariantPrice) {
        minVariantPrice = variantPrice;
      }

      if (p.options && Array.isArray(p.options)) {
        for (const opt of p.options) {
          await ProductPriceOptionModel.create({
            product_price_id: productPrice._id,
            option_id: opt,
          });
        }
      }

      // ✅ Seed Product_Warehouse at 0 for this variant, same as simple products.
      // Ensures the row (and thus the warehouse×variant matrix) exists even
      // before the first purchase — instead of relying entirely on
      // createPurchase's upsert to create it later.
      if (warehouseId) {
        await Product_WarehouseModel.create({
          productId: product._id,
          productPriceId: productPrice._id,
          warehouseId,
          quantity: 0,
          low_stock: low_stock || 0,
        });
      }

      variantIndex++;
    }

    product.price = minVariantPrice ?? 0;
    await product.save();

    // ✅ Now increments for variation products too, not just simple ones.
    if (warehouseId) {
      await WarehouseModel.findByIdAndUpdate(warehouseId, {
        $inc: {
          number_of_products: 1,
          stock_Quantity: 0,
        },
      });
    }
  }

  SuccessResponse(res, {
    message: "Product created successfully",
    product,
    stock,
  });
};

// ==================== جلب كل المنتجات ====================
export const getProduct = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { warehouseId } = req.query;

  const productFilter: any = {};
  if (warehouseId) {
    const productIdsInWarehouse = await Product_WarehouseModel.distinct(
      "productId",
      { warehouseId }
    );
    productFilter._id = { $in: productIdsInWarehouse };
  }

  const products = await ProductModel.find(productFilter)
    .populate("categoryId")
    .populate("brandId")
    .populate("taxesId")
    .populate("discountId", "_id name")
    .lean();

  const variations = await VariationModel.find().lean();

  const formattedProducts = await Promise.all(
    products.map(async (product: any) => {
      const stockFilter: any = { productId: product._id };
      if (warehouseId) stockFilter.warehouseId = warehouseId;

      const stocks = await Product_WarehouseModel.find(stockFilter)
        .populate("warehouseId", "name address")
        .lean();

      const totalQuantity = stocks.reduce((sum, s: any) => sum + s.quantity, 0);

      const variantQuantityMap: Record<string, number> = {};
      let simpleProductQuantity = 0;
      for (const s of stocks as any[]) {
        if (s.productPriceId) {
          const key = s.productPriceId.toString();
          variantQuantityMap[key] = (variantQuantityMap[key] || 0) + s.quantity;
        } else {
          simpleProductQuantity += s.quantity;
        }
      }

      const prices = await ProductPriceModel.find({
        productId: product._id,
      }).lean();

      const formattedPrices = await Promise.all(
        prices.map(async (price: any) => {
          const options = await ProductPriceOptionModel.find({
            product_price_id: price._id,
          })
            .populate({
              path: "option_id",
              select: "_id name variationId",
            })
            .lean();

          const groupedOptions: Record<string, any[]> = {};

          for (const po of options) {
            const option = po.option_id as any;
            if (!option?._id) continue;

            const variation = variations.find(
              (v) => v._id.toString() === option.variationId?.toString()
            );

            if (variation) {
              if (!groupedOptions[variation.name])
                groupedOptions[variation.name] = [];
              groupedOptions[variation.name].push(option);
            }
          }

          const variationsArray = Object.keys(groupedOptions).map(
            (varName) => ({
              name: varName,
              options: groupedOptions[varName],
            })
          );

          return {
            ...price,
            quantity: variantQuantityMap[price._id.toString()] ?? 0,
            variations: variationsArray,
          };
        })
      );

      return {
        ...product,
        quantity:
          prices.length === 0 ? simpleProductQuantity : product.quantity,
        totalQuantity,
        stocks,
        prices: formattedPrices,
      };
    })
  );

  SuccessResponse(res, { products: formattedProducts });
};

// ==================== جلب منتج واحد ====================
export const getOneProduct = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { id } = req.params;

  const product = await ProductModel.findById(id)
    .populate("categoryId")
    .populate("brandId")
    .populate("taxesId")
    .populate("discountId", "_id name")
    .lean();

  if (!product) throw new NotFound("Product not found");

  const variations = await VariationModel.find().lean();

  const stocks = await Product_WarehouseModel.find({ productId: product._id })
    .populate("warehouseId", "name address phone")
    .lean();

  const totalQuantity = stocks.reduce((sum, s: any) => sum + s.quantity, 0);

  const variantQuantityMap: Record<string, number> = {};
  let simpleProductQuantity = 0;
  for (const s of stocks as any[]) {
    if (s.productPriceId) {
      const key = s.productPriceId.toString();
      variantQuantityMap[key] = (variantQuantityMap[key] || 0) + s.quantity;
    } else {
      simpleProductQuantity += s.quantity;
    }
  }

  const prices = await ProductPriceModel.find({
    productId: product._id,
  }).lean();

  const formattedPrices = await Promise.all(
    prices.map(async (price: any) => {
      const options = await ProductPriceOptionModel.find({
        product_price_id: price._id,
      })
        .populate({
          path: "option_id",
          select: "_id name variationId",
        })
        .lean();

      const groupedOptions: Record<string, any[]> = {};

      for (const po of options) {
        const option = po.option_id as any;
        if (!option?._id) continue;

        const variation = variations.find(
          (v) => v._id.toString() === option.variationId?.toString()
        );

        if (variation) {
          if (!groupedOptions[variation.name])
            groupedOptions[variation.name] = [];
          groupedOptions[variation.name].push({
            _id: option._id,
            name: option.name,
          });
        }
      }

      const variationsArray = Object.keys(groupedOptions).map((varName) => ({
        name: varName,
        options: groupedOptions[varName],
      }));

      return {
        ...price,
        quantity: variantQuantityMap[price._id.toString()] ?? 0,
        variations: variationsArray,
      };
    })
  );

  SuccessResponse(res, {
    product: {
      ...product,
      quantity: prices.length === 0 ? simpleProductQuantity : product.quantity,
      totalQuantity,
      stocks,
      prices: formattedPrices,
    },
    message: "Product fetched successfully",
  });
};

// ==================== تحديث منتج ====================
export const updateProduct = async (req: Request, res: Response) => {
  const { id } = req.params;
  const {
    name,
    ar_name,
    image,
    categoryId,
    brandId,
    product_unit,
    sale_unit,
    purchase_unit,
    cost,
    price,
    description,
    ar_description,
    exp_ability,
    minimum_quantity_sale,
    low_stock,
    whole_price,
    start_quantaty,
    taxesId,
    product_has_imei,
    different_price,
    show_quantity,
    maximum_to_show,
    prices,
    gallery,
    free_shipping,
    is_featured,
    code,
    Is_Online,
  } = req.body;

  const product = await ProductModel.findById(id);
  if (!product) throw new NotFound("Product not found");

  const hasVariations = Array.isArray(prices) && prices.length > 0;
  const existingPrices = await ProductPriceModel.find({ productId: id });
  const productHasVariations = hasVariations || existingPrices.length > 0;

  const finalCode = code === "" ? undefined : code;

  if (!productHasVariations && finalCode && finalCode !== product.code) {
    const existingCode = await ProductModel.findOne({
      code: finalCode,
      _id: { $ne: id },
    });
    if (existingCode) throw new BadRequest("Product code already exists");
  }

  if (image) {
    product.image = await saveBase64Image(
      image,
      Date.now().toString(),
      req,
      "products"
    );
  }

  if (gallery && Array.isArray(gallery)) {
    let galleryUrls: string[] = [];
    for (const g of gallery) {
      if (typeof g === "string") {
        const gUrl = await saveBase64Image(
          g,
          Date.now().toString(),
          req,
          "product_gallery"
        );
        galleryUrls.push(gUrl);
      }
    }
    product.gallery_product = galleryUrls;
  }

  product.name = name ?? product.name;
  product.ar_name = ar_name ?? product.ar_name;
  product.categoryId = categoryId ?? product.categoryId;
  product.brandId = brandId ?? product.brandId;
  product.product_unit = product_unit ?? product.product_unit;
  product.sale_unit = sale_unit ?? product.sale_unit;
  product.purchase_unit = purchase_unit ?? product.purchase_unit;
  // NOTE: product.price for variation products is a derived/display value
  // (min variant price) — see recalculation below. For simple products,
  // price is editable directly.
  product.price = productHasVariations ? product.price : price ?? product.price;
  product.description = description ?? product.description;
  product.ar_description = ar_description ?? product.ar_description;
  product.exp_ability = exp_ability ?? product.exp_ability;
  product.minimum_quantity_sale =
    minimum_quantity_sale ?? product.minimum_quantity_sale;
  product.low_stock = low_stock ?? product.low_stock;
  product.whole_price = whole_price ?? product.whole_price;
  product.start_quantaty = start_quantaty ?? product.start_quantaty;
  // NOTE: cost is intentionally NOT overwritten here for the same reason
  // as quantity — createPurchase already keeps cost in sync from real
  // purchase unit_cost. Manual edits here would fight that. If you want
  // cost to remain manually editable, keep the line below; otherwise
  // remove it and let purchases be the source of truth for cost too.
  product.cost = cost ?? product.cost;
  product.taxesId = taxesId ?? product.taxesId;
  product.product_has_imei = product_has_imei ?? product.product_has_imei;
  product.different_price = different_price ?? product.different_price;
  product.show_quantity = show_quantity ?? product.show_quantity;
  product.maximum_to_show = maximum_to_show ?? product.maximum_to_show;
  product.free_shipping = free_shipping ?? product.free_shipping;
  product.is_featured = is_featured ?? product.is_featured;
  product.Is_Online = Is_Online ?? product.Is_Online;

  if (productHasVariations) {
    product.code = undefined as any;
  } else {
    product.code = finalCode ?? product.code;
  }

  await product.save();

  let minVariantPrice: number | null = null;

  if (prices && Array.isArray(prices)) {
    for (const p of prices) {
      let productPrice;
      const priceCode = p.code === "" ? undefined : p.code;

      if (priceCode) {
        const query: any = { code: priceCode };
        if (p._id) {
          query._id = { $ne: new mongoose.Types.ObjectId(p._id) };
        }
        const existingPriceCode = await ProductPriceModel.findOne(query);
        if (existingPriceCode) {
          throw new BadRequest(
            `Product price code '${priceCode}' already exists in another variation`
          );
        }
      }

      if (p._id) {
        // ✅ quantity is intentionally excluded — only purchase, sale,
        // transfer, and stock-adjustment endpoints may change it.
        productPrice = await ProductPriceModel.findByIdAndUpdate(
          p._id,
          {
            price: p.price,
            code: priceCode,
            cost: p.cost ?? undefined,
          },
          { new: true }
        );
      } else {
        // ✅ New variant added via update: quantity always starts at 0,
        // same rule as createProduct. No Product_Warehouse row is
        // created here because we don't have a warehouseId in this
        // endpoint's payload — the first purchase/adjustment into a
        // warehouse will upsert it via createPurchase's atomic upsert.
        let galleryUrls: string[] = [];
        if (p.gallery && Array.isArray(p.gallery)) {
          for (const g of p.gallery) {
            if (typeof g === "string") {
              const gUrl = await saveBase64Image(
                g,
                Date.now().toString(),
                req,
                "product_gallery"
              );
              galleryUrls.push(gUrl);
            }
          }
        }
        productPrice = await ProductPriceModel.create({
          productId: product._id,
          price: p.price,
          code: priceCode,
          quantity: 0,
          cost: p.cost || 0,
          gallery: galleryUrls,
        });
      }

      if (productPrice) {
        if (minVariantPrice === null || productPrice.price < minVariantPrice) {
          minVariantPrice = productPrice.price;
        }
      }

      if (productPrice && p.options && Array.isArray(p.options)) {
        await ProductPriceOptionModel.deleteMany({
          product_price_id: productPrice._id,
        });
        for (const opt of p.options) {
          await ProductPriceOptionModel.create({
            product_price_id: productPrice._id,
            option_id: opt,
          });
        }
      }
    }

    // ✅ Keep product.price (display/min price) in sync with variant
    // prices after edits — mirrors the logic already used in createProduct.
    if (productHasVariations && minVariantPrice !== null) {
      await ProductModel.findByIdAndUpdate(id, {
        $set: { price: minVariantPrice },
      });
    }
  }

  const finalProduct = await ProductModel.findById(id);

  SuccessResponse(res, {
    message: "Product updated successfully",
    product: finalProduct,
  });
};
// ==================== حذف منتج ====================
export const deleteProduct = async (req: Request, res: Response) => {
  const { id } = req.params;

  const product = await ProductModel.findById(id);
  if (!product) throw new NotFound("Product not found");

  // Delete stocks and update warehouses
  const stocks = await Product_WarehouseModel.find({ productId: id });

  const warehouseUpdates = new Map<string, number>();
  for (const stock of stocks) {
    const warehouseId = stock.warehouseId.toString();
    warehouseUpdates.set(
      warehouseId,
      (warehouseUpdates.get(warehouseId) || 0) + stock.quantity
    );
  }

  for (const [warehouseId, totalQuantity] of warehouseUpdates) {
    await WarehouseModel.findByIdAndUpdate(warehouseId, {
      $inc: {
        stock_Quantity: -totalQuantity,
        number_of_products: -1,
      },
    });
  }

  await Product_WarehouseModel.deleteMany({ productId: id });

  // Delete prices and options
  const prices = await ProductPriceModel.find({ productId: id });
  const priceIds = prices.map((p) => p._id);
  await ProductPriceOptionModel.deleteMany({
    product_price_id: { $in: priceIds },
  });
  await ProductPriceModel.deleteMany({ productId: id });

  // Update categories
  for (const catId of product.categoryId) {
    await CategoryModel.findByIdAndUpdate(catId, {
      $inc: { product_quantity: -1 },
    });
  }

  await ProductModel.findByIdAndDelete(id);
  SuccessResponse(res, {
    message: "Product and all related data deleted successfully",
  });
};

// ==================== جلب منتج بالكود ====================
export const getProductByCode = async (req: Request, res: Response) => {
  // نستقبل المتغير (code) والذي قد يحتوي على كود، اسم، أو كلمة "all"
  const { code } = req.body;

  if (!code) throw new BadRequest("Search term (code or name) is required");

  // تنظيف الكلمة والتأكد من حالتها
  const searchTerm = code.toString().trim();
  const isAll = searchTerm.toLowerCase() === "all";

  // ---------------------------------------------------------
  // الحالة الأولى: إذا كانت الكلمة "all"، نرجع كل المنتجات
  // ---------------------------------------------------------
  if (isAll) {
    const products = await ProductModel.find()
      .populate("categoryId")
      .populate("brandId")
      .populate("taxesId")
      .lean();

    const categories = await CategoryModel.find().lean();
    const brands = await BrandModel.find().lean();
    const variations = await VariationModel.find().lean();

    // جلب المخزون لكل المنتجات
    const productIds = products.map((p) => p._id);
    const stocks = await Product_WarehouseModel.find({
      productId: { $in: productIds },
    })
      .populate("warehouseId", "name address")
      .lean();

    // ربط المخزون بكل منتج
    const productsWithStock = products.map((product) => {
      const productStocks = stocks.filter(
        (s) => String(s.productId) === String(product._id)
      );
      const totalQuantity = productStocks.reduce(
        (sum, s) => sum + s.quantity,
        0
      );
      return { ...product, totalQuantity, stocks: productStocks };
    });

    return SuccessResponse(res, {
      products: productsWithStock, // لاحظ: مصفوفة products
      categories,
      brands,
      variations,
    });
  }

  // ---------------------------------------------------------
  // الحالة الثانية: دور في ProductPrice (نبحث هنا تطابق دقيق بالكود)
  // ---------------------------------------------------------
  const productPrice = await ProductPriceModel.findOne({
    code: searchTerm,
  }).lean();

  if (productPrice) {
    const product = await ProductModel.findById(productPrice.productId)
      .populate("categoryId")
      .populate("brandId")
      .populate("taxesId")
      .lean();

    if (!product) throw new NotFound("Product not found");

    const variations = await VariationModel.find().populate("options").lean();
    const categories = await CategoryModel.find().lean();
    const brands = await BrandModel.find().lean();

    const options = await ProductPriceOptionModel.find({
      product_price_id: productPrice._id,
    })
      .populate("option_id")
      .lean();

    const groupedOptions: Record<string, any[]> = {};

    options.forEach((po: any) => {
      const option = po.option_id;
      if (!option || !option._id) return;

      const variation = variations.find((v: any) =>
        v.options.some((opt: any) => String(opt._id) === String(option._id))
      );

      if (variation) {
        if (!groupedOptions[variation.name])
          groupedOptions[variation.name] = [];
        groupedOptions[variation.name].push(option);
      }
    });

    const variationsArray = Object.keys(groupedOptions).map((varName) => ({
      name: varName,
      options: groupedOptions[varName],
    }));

    (product as any).price = {
      ...productPrice,
      variations: variationsArray,
    };

    const stocks = await Product_WarehouseModel.find({ productId: product._id })
      .populate("warehouseId", "name address")
      .lean();
    const totalQuantity = stocks.reduce((sum, s) => sum + s.quantity, 0);

    return SuccessResponse(res, {
      product: {
        // هنا ترجع Object واحد لأنه تطابق مع تسعيرة محددة
        ...product,
        totalQuantity,
        stocks,
      },
      categories,
      brands,
      variations,
    });
  }

  // ---------------------------------------------------------
  // الحالة الثالثة: دور في Product بالـ Code أو الـ Name
  // ---------------------------------------------------------
  const products = await ProductModel.find({
    $or: [
      { code: searchTerm }, // بحث دقيق بالكود
      { name: { $regex: searchTerm, $options: "i" } }, // بحث جزئي بالاسم (غير حساس للأحرف)
    ],
  })
    .populate("categoryId")
    .populate("brandId")
    .populate("taxesId")
    .lean();

  if (!products || products.length === 0)
    throw new NotFound("No products found for this search term");

  const categories = await CategoryModel.find().lean();
  const brands = await BrandModel.find().lean();
  const variations = await VariationModel.find().lean();

  // جلب المخزون لكل المنتجات التي طابقت البحث
  const productIds = products.map((p) => p._id);
  const stocks = await Product_WarehouseModel.find({
    productId: { $in: productIds },
  })
    .populate("warehouseId", "name address")
    .lean();

  // تجميع المخزون لكل منتج في المصفوفة
  const productsWithStock = products.map((product) => {
    const productStocks = stocks.filter(
      (s) => String(s.productId) === String(product._id)
    );
    const totalQuantity = productStocks.reduce((sum, s) => sum + s.quantity, 0);
    return { ...product, totalQuantity, stocks: productStocks };
  });

  return SuccessResponse(res, {
    products: productsWithStock, // ترجع كمصفوفة لأن البحث بالاسم قد يحتوي نتائج متعددة
    categories,
    brands,
    variations,
  });
};

export const generateBarcodeImageController = async (
  req: Request,
  res: Response
) => {
  const { product_price_id } = req.params;
  if (!product_price_id) throw new BadRequest("Product price ID is required");

  const productPrice = await ProductPriceModel.findById(product_price_id);
  if (!productPrice) throw new NotFound("Product price not found");

  const productCode = productPrice.code;
  if (!productCode)
    throw new BadRequest("Product price does not have a code yet");

  const imageLink = await generateBarcodeImage(productCode, productCode);
  const fullImageUrl = `${req.protocol}://${req.get("host")}${imageLink}`;

  SuccessResponse(res, {
    image: fullImageUrl,
    code: productCode,
  });
};

export const generateProductCode = async (req: Request, res: Response) => {
  let newCode = generateEAN13Barcode();

  while (await ProductPriceModel.findOne({ code: newCode })) {
    newCode = generateEAN13Barcode();
  }

  SuccessResponse(res, { code: newCode });
};

export const modelsforselect = async (req: Request, res: Response) => {
  const categories = await CategoryModel.find().lean();
  const brands = await BrandModel.find().lean();
  const variations = await VariationModel.find().lean().populate("options");
  const warehouses = await WarehouseModel.find().lean();
  const units = await UnitModel.find().lean();
  const discounts = await DiscountModel.find({
    status: true,
    applyIn: "E-commerce",
  }).lean();

  SuccessResponse(res, {
    categories,
    brands,
    variations,
    warehouses,
    units,
    discounts,
  });
};

// ═══════════════════════════════════════════════════════════
// IMPORT PRODUCTS FROM EXCEL
// ═══════════════════════════════════════════════════════════
export const importProductsFromExcel = async (req: Request, res: Response) => {
  if (!req.file) {
    throw new BadRequest("Excel file is required");
  }

  const workbook = new ExcelJS.Workbook();
  const arrayBuffer = req.file.buffer.buffer.slice(
    req.file.buffer.byteOffset,
    req.file.buffer.byteOffset + req.file.buffer.byteLength
  ) as ArrayBuffer;
  await workbook.xlsx.load(arrayBuffer);

  const worksheet = workbook.getWorksheet(1);

  if (!worksheet) {
    throw new BadRequest("Invalid Excel file");
  }

  // اقرأ الـ headers
  const headers: string[] = [];
  worksheet.getRow(1).eachCell((cell, colNumber) => {
    headers[colNumber] = cell.value?.toString().trim().toLowerCase() || "";
  });

  // Mapping للأعمدة
  const findColumn = (names: string[]): number => {
    for (const name of names) {
      const index = headers.findIndex((h) => h === name.toLowerCase());
      if (index !== -1) return index;
    }
    return -1;
  };

  const cols = {
    name: findColumn(["name", "product name", "اسم المنتج"]),
    ar_name: findColumn(["ar_name", "arabic name", "الاسم بالعربي"]),
    ar_description: findColumn([
      "ar_description",
      "arabic description",
      "الوصف بالعربي",
    ]),
    description: findColumn(["description", "الوصف"]),
    category: findColumn(["category", "categories", "القسم", "التصنيف"]),
    brand: findColumn(["brand", "الماركة"]),
    code: findColumn(["code", "sku", "barcode", "الكود"]),
    price: findColumn(["price", "selling price", "سعر البيع"]),
    cost: findColumn(["cost", "purchase price", "التكلفة", "سعر الشراء"]),
    quantity: findColumn(["quantity", "qty", "stock", "الكمية"]),
    low_stock: findColumn(["low_stock", "low stock", "الحد الأدنى"]),
    whole_price: findColumn(["whole_price", "wholesale price", "سعر الجملة"]),
    start_quantaty: findColumn([
      "start_quantaty",
      "start quantity",
      "كمية البداية",
    ]),
    minimum_quantity_sale: findColumn([
      "minimum_quantity_sale",
      "min sale qty",
      "أقل كمية بيع",
    ]),
    product_unit: findColumn(["product_unit", "unit", "الوحدة"]),
    sale_unit: findColumn(["sale_unit", "وحدة البيع"]),
    purchase_unit: findColumn(["purchase_unit", "وحدة الشراء"]),
    taxes: findColumn(["taxes", "tax", "الضريبة"]),
    exp_ability: findColumn(["exp_ability", "has expiry", "قابل للانتهاء"]),
    product_has_imei: findColumn(["product_has_imei", "has imei", "له سيريال"]),
    different_price: findColumn(["different_price", "سعر مختلف"]),
    show_quantity: findColumn(["show_quantity", "اظهار الكمية"]),
    maximum_to_show: findColumn([
      "maximum_to_show",
      "max to show",
      "أقصى كمية للعرض",
    ]),
    is_featured: findColumn(["is_featured", "featured", "مميز"]),
    image: findColumn(["image", "photo", "الصورة"]),
    gallery_product: findColumn(["gallery_product", "gallery", "معرض الصور"]),
  };

  // Helper functions
  const getValue = (row: ExcelJS.Row, colIndex: number): string => {
    if (colIndex === -1) return "";
    return (
      row
        .getCell(colIndex + 1)
        .value?.toString()
        .trim() || ""
    );
  };

  const getNumber = (row: ExcelJS.Row, colIndex: number): number => {
    if (colIndex === -1) return 0;
    return Number(row.getCell(colIndex + 1).value) || 0;
  };

  const getBoolean = (row: ExcelJS.Row, colIndex: number): boolean => {
    if (colIndex === -1) return false;
    const val = row
      .getCell(colIndex + 1)
      .value?.toString()
      .toLowerCase()
      .trim();
    return val === "true" || val === "1" || val === "yes" || val === "نعم";
  };

  const products: any[] = [];

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;

    // Fallback للأعمدة الثابتة لو مفيش headers
    const name =
      cols.name !== -1
        ? getValue(row, cols.name)
        : row.getCell(1).value?.toString().trim() || "";
    const ar_name =
      cols.ar_name !== -1
        ? getValue(row, cols.ar_name)
        : row.getCell(2).value?.toString().trim() || "";

    if (name) {
      products.push({
        name,
        ar_name: ar_name || name,
        ar_description:
          cols.ar_description !== -1
            ? getValue(row, cols.ar_description)
            : row.getCell(3).value?.toString().trim() || "",
        description:
          cols.description !== -1
            ? getValue(row, cols.description)
            : row.getCell(4).value?.toString().trim() || "",
        category:
          cols.category !== -1
            ? getValue(row, cols.category)
            : row.getCell(5).value?.toString().trim() || "",
        brand:
          cols.brand !== -1
            ? getValue(row, cols.brand)
            : row.getCell(6).value?.toString().trim() || "",
        code:
          cols.code !== -1
            ? getValue(row, cols.code)
            : row.getCell(7).value?.toString().trim() || "",
        price:
          cols.price !== -1
            ? getNumber(row, cols.price)
            : Number(row.getCell(8).value) || 0,
        cost:
          cols.cost !== -1
            ? getNumber(row, cols.cost)
            : Number(row.getCell(9).value) || 0,
        quantity:
          cols.quantity !== -1
            ? getNumber(row, cols.quantity)
            : Number(row.getCell(10).value) || 0,
        low_stock:
          cols.low_stock !== -1
            ? getNumber(row, cols.low_stock)
            : Number(row.getCell(12).value) || 0,
        whole_price: getNumber(row, cols.whole_price),
        start_quantaty: getNumber(row, cols.start_quantaty),
        minimum_quantity_sale: getNumber(row, cols.minimum_quantity_sale) || 1,
        product_unit: getValue(row, cols.product_unit),
        sale_unit: getValue(row, cols.sale_unit),
        purchase_unit: getValue(row, cols.purchase_unit),
        taxes: getValue(row, cols.taxes),
        exp_ability: getBoolean(row, cols.exp_ability),
        product_has_imei: getBoolean(row, cols.product_has_imei),
        different_price: getBoolean(row, cols.different_price),
        show_quantity:
          cols.show_quantity !== -1
            ? getBoolean(row, cols.show_quantity)
            : true,
        maximum_to_show: getNumber(row, cols.maximum_to_show),
        is_featured: getBoolean(row, cols.is_featured),
        image:
          cols.image !== -1
            ? getValue(row, cols.image)
            : row.getCell(13).value?.toString().trim() || "",
        gallery_product: getValue(row, cols.gallery_product),
      });
    }
  });

  if (products.length === 0) {
    throw new BadRequest("No valid products found in the file");
  }

  const results = {
    success: [] as string[],
    failed: [] as { name: string; reason: string }[],
    skipped: [] as { name: string; reason: string }[],
  };

  // Cache all lookups
  const existingCategories = await CategoryModel.find({}).lean();
  const categoryMap: { [key: string]: string } = {};
  existingCategories.forEach((cat: any) => {
    categoryMap[cat.name.toLowerCase()] = cat._id.toString();
  });

  const existingBrands = await BrandModel.find({}).lean();
  const brandMap: { [key: string]: string } = {};
  existingBrands.forEach((brand: any) => {
    brandMap[brand.name.toLowerCase()] = brand._id.toString();
  });

  const existingUnits = await UnitModel.find({}).lean();
  const unitMap: { [key: string]: string } = {};
  existingUnits.forEach((unit: any) => {
    unitMap[unit.name.toLowerCase()] = unit._id.toString();
  });

  const existingTaxes = await TaxesModel.find({}).lean();
  const taxMap: { [key: string]: string } = {};
  existingTaxes.forEach((tax: any) => {
    taxMap[tax.name.toLowerCase()] = tax._id.toString();
  });

  // Check existing products
  const existingProducts = await ProductModel.find(
    {},
    { code: 1, name: 1 }
  ).lean();
  const codeSet = new Set(
    existingProducts.map((p: any) => p.code).filter(Boolean)
  );
  const nameSet = new Set(
    existingProducts.map((p: any) => p.name.toLowerCase())
  );

  for (const prod of products) {
    try {
      // Check if name already exists
      if (nameSet.has(prod.name.toLowerCase())) {
        results.skipped.push({
          name: prod.name,
          reason: "Product with this name already exists",
        });
        continue;
      }

      // Check if code already exists
      if (prod.code && codeSet.has(prod.code)) {
        results.skipped.push({
          name: prod.name,
          reason: `Code "${prod.code}" already exists`,
        });
        continue;
      }

      // Find categories
      let categoryIds: string[] = [];
      if (prod.category) {
        const categories = prod.category
          .split(",")
          .map((c: string) => c.trim());
        for (const catName of categories) {
          const catId = categoryMap[catName.toLowerCase()];
          if (catId) {
            categoryIds.push(catId);
          }
        }
      }

      if (categoryIds.length === 0) {
        results.failed.push({
          name: prod.name,
          reason: `Category "${prod.category}" not found`,
        });
        continue;
      }

      // Find brand (optional)
      let brandId = null;
      if (prod.brand) {
        brandId = brandMap[prod.brand.toLowerCase()] || null;
      }

      // Find units (optional)
      const productUnitId = prod.product_unit
        ? unitMap[prod.product_unit.toLowerCase()]
        : null;
      const saleUnitId = prod.sale_unit
        ? unitMap[prod.sale_unit.toLowerCase()]
        : null;
      const purchaseUnitId = prod.purchase_unit
        ? unitMap[prod.purchase_unit.toLowerCase()]
        : null;

      // Find tax (optional)
      const taxId = prod.taxes ? taxMap[prod.taxes.toLowerCase()] : null;

      // Parse gallery images
      let galleryImages: string[] = [];
      if (prod.gallery_product) {
        galleryImages = prod.gallery_product
          .split(",")
          .map((img: string) => img.trim())
          .filter(Boolean);
      }

      // Create product
      const newProduct = await ProductModel.create({
        name: prod.name,
        ar_name: prod.ar_name,
        ar_description: prod.ar_description || prod.ar_name,
        description: prod.description || "",
        categoryId: categoryIds,
        brandId: brandId || undefined,
        product_unit: productUnitId || undefined,
        sale_unit: saleUnitId || undefined,
        purchase_unit: purchaseUnitId || undefined,
        code: prod.code || undefined,
        price: prod.price,
        cost: prod.cost || undefined,
        quantity: prod.quantity,
        low_stock: prod.low_stock || 0,
        whole_price: prod.whole_price || undefined,
        start_quantaty: prod.start_quantaty || undefined,
        minimum_quantity_sale: prod.minimum_quantity_sale || 1,
        taxesId: taxId || undefined,
        exp_ability: prod.exp_ability,
        product_has_imei: prod.product_has_imei,
        different_price: prod.different_price,
        show_quantity: prod.show_quantity,
        maximum_to_show: prod.maximum_to_show || undefined,
        is_featured: prod.is_featured,
        image: prod.image || undefined,
        gallery_product: galleryImages.length > 0 ? galleryImages : undefined,
      });

      // Update category product count
      for (const catId of categoryIds) {
        await CategoryModel.findByIdAndUpdate(catId, {
          $inc: { product_quantity: 1 },
        });
      }

      nameSet.add(prod.name.toLowerCase());
      if (prod.code) codeSet.add(prod.code);

      results.success.push(prod.name);
    } catch (error: any) {
      results.failed.push({
        name: prod.name,
        reason: error.message || "Unknown error",
      });
    }
  }

  return SuccessResponse(res, {
    message: "Import completed",
    total: products.length,
    success_count: results.success.length,
    failed_count: results.failed.length,
    skipped_count: results.skipped.length,
    success: results.success,
    failed: results.failed,
    skipped: results.skipped,
  });
};

export const deletemanyproducts = async (req: Request, res: Response) => {
  const { ids } = req.body;
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    throw new BadRequest("At least one product ID is required");
  }

  // Get all products to be deleted
  const products = await ProductModel.find({ _id: { $in: ids } });

  for (const product of products) {
    // Delete stocks and update warehouses
    const stocks = await Product_WarehouseModel.find({
      productId: product._id,
    });
    for (const stock of stocks) {
      await WarehouseModel.findByIdAndUpdate(stock.warehouseId, {
        $inc: {
          number_of_products: -1,
          stock_Quantity: -stock.quantity,
        },
      });
    }
    await Product_WarehouseModel.deleteMany({ productId: product._id });

    // Delete prices and options
    const prices = await ProductPriceModel.find({ productId: product._id });
    const priceIds = prices.map((p) => p._id);
    await ProductPriceOptionModel.deleteMany({
      product_price_id: { $in: priceIds },
    });
    await ProductPriceModel.deleteMany({ productId: product._id });

    // Update categories
    for (const catId of product.categoryId) {
      await CategoryModel.findByIdAndUpdate(catId, {
        $inc: { product_quantity: -1 },
      });
    }
  }

  await ProductModel.deleteMany({ _id: { $in: ids } });
  SuccessResponse(res, { message: "Products deleted successfully" });
};

export const getLowStockProducts = async (req: Request, res: Response) => {
  const { warehouseId } = req.query;

  // Get all products with their low_stock threshold
  const products = await ProductModel.find({
    low_stock: { $exists: true, $gt: 0 },
  })
    .select("name ar_name code low_stock image categoryId brandId")
    .populate("categoryId", "name ar_name")
    .populate("brandId", "name ar_name")
    .lean();

  const lowStockProducts = [];

  for (const product of products) {
    // Build stock query
    const stockQuery: any = { productId: product._id };
    if (warehouseId) {
      stockQuery.warehouseId = warehouseId;
    }

    // Get stocks for this product
    const stocks = await Product_WarehouseModel.find(stockQuery)
      .populate("warehouseId", "name")
      .lean();

    const totalQuantity = stocks.reduce((sum, s) => sum + s.quantity, 0);
    const lowStockThreshold = product.low_stock ?? 0;

    // Check if total stock is below threshold
    if (totalQuantity <= lowStockThreshold) {
      lowStockProducts.push({
        _id: product._id,
        name: product.name,
        ar_name: product.ar_name,
        code: product.code,
        image: product.image,
        actual_stock: totalQuantity,
        minimum_stock: lowStockThreshold,
        shortage: lowStockThreshold - totalQuantity,
        category: product.categoryId,
        brand: product.brandId,
        stocks,
      });
    }
  }

  SuccessResponse(res, {
    message: "Low stock products retrieved successfully",
    count: lowStockProducts.length,
    products: lowStockProducts,
  });
};
