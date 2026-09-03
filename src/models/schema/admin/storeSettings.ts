import mongoose from 'mongoose';

const appSettingSchema = new mongoose.Schema({
  key: { type: String, default: 'main', unique: true },
  templateSlug: { type: String, required: true },
  templateSectionsSnapshot: [{ type: String }],

  storeName: { type: String, required: true },
  logoUrl: { type: String },
  fontStyle: { type: String, default: 'default' },
  colors: { type: Map, of: String, default: {} },
  
  sections: [{
    key: { type: String, required: true },
    enabled: { type: Boolean, default: true },
    templateSlug: { type: String, default: "default" },
    _id: false,
  }],
}, { timestamps: true });

export const appSettingModel = mongoose.model('AppSetting', appSettingSchema);