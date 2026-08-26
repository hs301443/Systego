import mongoose from "mongoose";

const productPriceSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    price: { type: Number, required: true },
    code: { type: String, unique: true, sparse: true }, 
    gallery: [{ type: String }],
    quantity: { type: Number, default: 0 },
    strat_quantaty: { type: Number, default: 0 },
    cost: { type: Number, default: 0 },
  },
  { timestamps: true }
);

productPriceSchema.virtual("productpriceoptions", {
  ref: "ProductPriceOption",          // The model to use
  localField: "_id",                  // Field on ProductPrice
  foreignField: "product_price_id"    // Field on ProductPriceOption
});

// Enable virtuals in JSON and object output
productPriceSchema.set("toObject", { virtuals: true });
productPriceSchema.set("toJSON", { virtuals: true });

export const ProductPriceModel = mongoose.model("ProductPrice", productPriceSchema);

const productPriceOptionSchema = new mongoose.Schema(
  {
    product_price_id: { type: mongoose.Schema.Types.ObjectId, ref: "ProductPrice", required: true },
    option_id: { type: mongoose.Schema.Types.ObjectId, ref: "Option", required: true },
  },
  { timestamps: true }
);

productPriceOptionSchema.virtual("option", {
  ref: "Option",
  localField: "option_id",
  foreignField: "_id",
  justOne: true   // one option per product price option
});

productPriceOptionSchema.set("toObject", { virtuals: true });
productPriceOptionSchema.set("toJSON", { virtuals: true });

export const ProductPriceOptionModel = mongoose.model("ProductPriceOption", productPriceOptionSchema);
