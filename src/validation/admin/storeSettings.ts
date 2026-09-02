import Joi from "joi";

export const appSettingValidationSchema = Joi.object({
  key: Joi.string()
    .optional()
    .description('Unique identifier, defaults to "main"'),

  templateSlug: Joi.string()
    .required()
    .description('Slug of the template'),

  templateSectionsSnapshot: Joi.array()
    .items(Joi.string())
    .optional()
    .description('List of section keys snapshot'),

  storeName: Joi.string()
    .required()
    .description('Name of the store'),

  logoUrl: Joi.string()
    .uri({ allowRelative: false })
    .allow(null, '')
    .optional()
    .description('URL of the store logo'),

  fontStyle: Joi.string()
    .default('default')
    .optional()
    .description('Font style identifier'),

  colors: Joi.object()
    .pattern(Joi.string(), Joi.string())
    .default({})
    .optional()
    .description('Map of color names to color values'),

  sections: Joi.array()
    .items(
      Joi.object({
        key: Joi.string()
          .required()
          .description('Unique key for the section'),
        enabled: Joi.boolean()
          .default(true)
          .description('Whether the section is enabled'),
        templateSlug: Joi.string()
          .default('default')
          .description('Slug of the template for the section'),
      })
    )
    .optional()
    .description('List of section configuration objects'),
});