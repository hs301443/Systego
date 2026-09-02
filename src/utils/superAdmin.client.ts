import axios from "axios";
const SUPER_ADMIN_URL = process.env.SUPER_ADMIN_SERVICE_URL;

export const fetchCategories = async () => {
  const { data } = await axios.get(`${SUPER_ADMIN_URL}/api/admin/theme-categories`);
  return data.data;
};

export const fetchTemplates = async (categoryId:string) => {
  const { data } = await axios.get(`${SUPER_ADMIN_URL}/api/admin/themes?categoryId=${categoryId}`);
  return data.data;
};

export const fetchTemplateBySlug = async (slug:string) => {
  const { data } = await axios.get(`${SUPER_ADMIN_URL}/api/admin/themes/slug/${slug}`);
  return data.data;
};