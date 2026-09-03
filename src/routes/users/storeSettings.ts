import { Router } from "express";
import { getStoreSettings } from "../../controller/admin/storeSettings";
const router = Router();

router.get("/", getStoreSettings);
export default router;