import Joi from "joi";

export const createWarehouseSchema = Joi.object({
  name: Joi.string().max(100).required(),
  address: Joi.string().required(),
  phone: Joi.string().max(20).required(),
  email: Joi.string().email().max(150).optional(),
  Is_Online: Joi.boolean().optional(),
});

export const updateWarehouseSchema = Joi.object({
  name: Joi.string().max(100).optional(),
  address: Joi.string().optional(),
  phone: Joi.string().max(20).optional(),
  email: Joi.string().email().max(150).optional(),
  Is_Online: Joi.boolean().optional(),
});
