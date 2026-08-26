import mongoose, { Schema } from "mongoose";

const categorySchema = new Schema(
  {
    name: { type: String, required: true },
    ar_name: { type: String, required: true },
    image: { type: String },
    parentId: { type: Schema.Types.ObjectId, ref: "Category" },
    product_quantity: { type: Number, default: 0 },
    Is_Online: { type: Boolean, default: true },
    order: {type: Number, default: 999},
  },
  { timestamps: true }
);

categorySchema.virtual("products", {
  ref: "Product",
  localField: "_id",
  foreignField: "categoryId",
});

export const CategoryModel = mongoose.model("Category", categorySchema);