import "dotenv/config";

const tenant = process.env.GRONER_TENANT;
if (!tenant) throw new Error("GRONER_TENANT não definido no .env");

export const config = {
  tenant,
  baseUrl: `https://${tenant}.api.groner.app/api`,
  token: process.env.GRONER_TOKEN ?? null,
  email: process.env.GRONER_EMAIL ?? null,
  senha: process.env.GRONER_SENHA ?? null,
};
