import { Request, Response } from "express";
import { WarehouseModel } from "../../models/schema/admin/Warehouse";
import { BadRequest } from "../../Errors/BadRequest";
import { NotFound } from "../../Errors";
import { SuccessResponse } from "../../utils/response";

// Helper function لتحديث حالة Online
const setOnlineStatus = async (warehouseId: string) => {
    // خلي كل المخازن التانية offline
    await WarehouseModel.updateMany(
        { _id: { $ne: warehouseId } },
        { Is_Online: false }
    );
};

export const createWarehouse = async (req: Request, res: Response) => {
    const { name, address, phone, email, Is_Online } = req.body;

    if (!name || !address || !phone) {
        throw new BadRequest("Name, address, phone are required");
    }
    
    const existingWarehouse = await WarehouseModel.findOne({ name });
    if (existingWarehouse) throw new BadRequest("Warehouse already exists");

    // لو المخزن الجديد هيكون online، خلي الباقي offline الأول
    if (Is_Online === true) {
        await WarehouseModel.updateMany({}, { Is_Online: false });
    }

    const warehouse = await WarehouseModel.create({
        name,
        address,
        phone,
        email,
        Is_Online: Is_Online || false,
    });

    SuccessResponse(res, { message: "Create warehouse successfully", warehouse });
};


export const getWarehouses = async (req: Request, res: Response) => {
    const warehouses = await WarehouseModel.find();
    SuccessResponse(res, { message: "Get warehouses successfully", warehouses });
};



export const updateWarehouse = async (req: Request, res: Response) => {
    const { id } = req.params;
    if (!id) throw new BadRequest("Warehouse ID is required");

    // لو بيحدث المخزن ليكون online، خلي الباقي offline الأول
    if (req.body.Is_Online === true) {
        await WarehouseModel.updateMany(
            { _id: { $ne: id } },
            { Is_Online: false }
        );
    }

    const warehouse = await WarehouseModel.findByIdAndUpdate(
        id,
        req.body,
        { new: true }
    );

    if (!warehouse) throw new NotFound("Warehouse not found");

    SuccessResponse(res, { message: "Update warehouse successfully", warehouse });
};

export const getWarehouseById = async (req: Request, res: Response) => {
    const { id } = req.params;
    if (!id) throw new BadRequest("Warehouse ID is required");
    const warehouse = await WarehouseModel.findById(id);
    if (!warehouse) throw new NotFound("Warehouse not found");
    SuccessResponse(res, { message: "Get warehouse successfully", warehouse });
};

export const deleteWarehouse = async (req: Request, res: Response) => {
    const { id } = req.params;
    if (!id) throw new BadRequest("Warehouse ID is required");
    const warehouse = await WarehouseModel.findByIdAndDelete(id);
    if (!warehouse) throw new NotFound("Warehouse not found");
    SuccessResponse(res, { message: "Delete warehouse successfully" });
};