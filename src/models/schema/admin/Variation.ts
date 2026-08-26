import mongoose, { Document, Schema, Model } from "mongoose";

// واجهة Variation
export interface IVariation extends Document {
  ar_name: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

// واجهة Option
export interface IOption extends Document {
  variationId: mongoose.Types.ObjectId;
  name: string;
  status: boolean;
  createdAt: Date;
  updatedAt: Date;
}
  const VariationSchema: Schema<IVariation> = new Schema(
  {
    name: { type: String, required: true, unique: true },
    ar_name: { type: String, required: true },
  },
  { timestamps: true }
);

const OptionSchema: Schema<IOption> = new Schema(
  {
    variationId: { type: Schema.Types.ObjectId, ref: "Variation", required: true },
    name: { type: String, required: true },
    status: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// في VariationSchema
VariationSchema.virtual("options", {
  ref: "Option",
  localField: "_id",
  foreignField: "variationId",
});

VariationSchema.set("toObject", { virtuals: true });
VariationSchema.set("toJSON", { virtuals: true });

export const VariationModel: Model<IVariation> = mongoose.model<IVariation>("Variation", VariationSchema);

OptionSchema.virtual("variation", {
  ref: "Variation",
  localField: "variationId",
  foreignField: "_id",
  justOne: true
});

OptionSchema.set("toObject", { virtuals: true });
OptionSchema.set("toJSON", { virtuals: true });

export const OptionModel: Model<IOption> = mongoose.model<IOption>("Option", OptionSchema);
