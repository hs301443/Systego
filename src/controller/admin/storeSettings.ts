import { Request, Response } from "express";
import asyncHandler from "express-async-handler";
import { BadRequest } from "../../Errors/BadRequest";
import { SuccessResponse } from "../../utils/response";
import { appSettingModel } from "../../models/schema/admin/storeSettings";
import { saveBase64Image } from "../../utils/handleImages";
import { fetchCategories, fetchTemplates, fetchTemplateBySlug } from "../../utils/superAdmin.client";

export const browseThemesCategories = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const categories = await fetchCategories();
    SuccessResponse(
      res,
      {
        message: "Themes categories fetched successfully",
        categories,
      },
      200
    );
  }
);

export const browseThemesBySlug = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { slug } = req.params;
    const template = await fetchTemplateBySlug(slug);
    SuccessResponse(
      res,
      {
        message: "Theme fetched successfully",
        template,
      },
      200
    );
  }
);

export const getCategoryThemes = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { categoryId } = req.params;
    const themes = await fetchTemplates(categoryId);
    SuccessResponse(
      res,
      {
        message: "Themes fetched successfully",
        themes,
      },
      200
    );
  }
);

// Get store settings
export const getStoreSettings = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    let settings = await appSettingModel.findOne();

    if (!settings) {
      settings = await appSettingModel.create({
        templateSlug: "default",
        storeName: "Store",
        logoUrl: null,
      });
    }

    SuccessResponse(
      res,
      {
        message: "Store settings fetched successfully",
        settings,
      },
      200
    );
  }
);

// Update store settings
export const updateStoreSettings = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const {
      storeName,
      logo,
      templateSlug,
      templateSectionsSnapshot,
      fontStyle,
      colors,
      sections,
    } = req.body;

    

    let settings = await appSettingModel.findOne();

    if (!settings) {
      let logoUrl: string | null = null;

      if (logo) {
        logoUrl = await saveBase64Image(
          logo,
          `${Date.now()}_store_logo`,
          req,
          "store"
        );
      }

      settings = await appSettingModel.create({
        templateSlug,
        storeName: storeName.trim(),
        logoUrl: logoUrl,
        templateSectionsSnapshot: templateSectionsSnapshot || [],
        fontStyle: fontStyle || "default",
        colors: colors || {},
        sections: sections || [],
      });
    } else {
      settings.storeName = storeName.trim();
      if (logo) {
        const logoUrl = await saveBase64Image(
          logo,
          `${Date.now()}_store_logo`,
          req,
          "store"
        );
        settings.logoUrl = logoUrl;
      }
      settings.templateSlug = templateSlug;
      settings.templateSectionsSnapshot = templateSectionsSnapshot || [];
      settings.fontStyle = fontStyle || "default";
      settings.colors = colors || {};
      settings.sections = sections || [];
      await settings.save();
    }

    SuccessResponse(
      res,
      {
        message: "Store settings updated successfully",
        settings,
      },
      200
    );
  }
);
