// gateway.controller.ts
import { Router } from 'express';
import mongoose from 'mongoose';

const router = Router();

router.post('/gateway', async (req, res) => {
  const { table, operation, filter = {}, data, options = {} } = req.body;

  const Model = mongoose.models[table];
  if (!Model) {
    return res.status(400).json({ error: `Unknown table: ${table}` });
  }

  try {
    let result;

    switch (operation) {
      case 'read':
        result = await Model.find(filter, options.projection || null, {
          sort: options.sort,
          limit: options.limit,
          skip: options.skip,
        });
        break;

      case 'count':
        result = await Model.countDocuments(filter);
        break;

      case 'write':
        result = await Model.create(data);
        break;

      case 'edit':
        result = await Model.updateMany(filter, { $set: data }, { runValidators: true });
        break;

      case 'delete':
        result = await Model.deleteMany(filter);
        break;

      default:
        return res.status(400).json({ error: `Unsupported operation: ${operation}` });
    }

    res.json({ data: result });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;