import { Router } from "express";
import { createWasted } from "../../../controller/admin/POS/wasted";
import { catchAsync } from "../../../utils/catchAsync";

const router = Router();

router.post("/",catchAsync(createWasted));

export default router;
