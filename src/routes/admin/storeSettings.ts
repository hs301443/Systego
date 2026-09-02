// routes/storeSettings.routes.ts

import { Router } from "express";
import {
    browseThemesBySlug,
    browseThemesCategories,
    getCategoryThemes,
    getStoreSettings,
    updateStoreSettings,
} from "../../controller/admin/storeSettings";
import { validate } from "../../middlewares/validation";
import { appSettingValidationSchema } from "../../validation/admin/storeSettings";

const router = Router();

router.get("/", getStoreSettings);
router.get("/themes/categories", browseThemesCategories);
router.get("/themes/categories/:categoryId", getCategoryThemes);
router.get("/themes/:slug", browseThemesBySlug);

router.put("/", validate(appSettingValidationSchema), updateStoreSettings);

export default router;