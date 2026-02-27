import { ConfigSchema, type SiteConfig } from './schema/config.schema';

declare const __CLIENT_CONFIG_PATH__: string;

const raw = await import(/* @vite-ignore */ `../../${__CLIENT_CONFIG_PATH__}`, {
	assert: { type: 'json' }
});

export const config: SiteConfig = ConfigSchema.parse(raw.default);
