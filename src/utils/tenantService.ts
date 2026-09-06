import axios from "axios";

/**
 * TenantService: Communicates with Super Systego to verify this client's
 * subscription package and feature access.
 * 
 * Uses in-memory cache to avoid calling Super Systego on every request.
 * Cache TTL: 10 minutes.
 * 
 * Environment variables required:
 *   - SUPER_SYSTEGO_URL     (https://superback.systego.net)
 *   - SUPER_SYSTEGO_API_KEY (the tenant's unique API key)
 */

// ─── Types ─────────────────────────────────────────────────────────

export interface TenantFeatures {
    haveEcommerce: boolean;
    haveMobileApp: boolean;
    havePOS: boolean;
    haveReports: boolean;
    haveStockTake: boolean;
}

export interface TenantInfo {
    tenant: {
        company_name: string;
        subdomain: string;
        status: string;
    };
    features: TenantFeatures;
    package: {
        name: string | null;
        status: boolean;
    };
}

// ─── Cache ─────────────────────────────────────────────────────────

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

let cachedData: TenantInfo | null = null;
let cachedAt: number = 0;

function isCacheValid(): boolean {
    return cachedData !== null && (Date.now() - cachedAt) < CACHE_TTL_MS;
}

/**
 * Force clear the cache. Next call to getFeatures/getTenantInfo will
 * make a fresh request to Super Systego.
 */
export function clearCache(): void {
    cachedData = null;
    cachedAt = 0;
}

// ─── API Client ────────────────────────────────────────────────────

function getClient() {
    const baseURL = process.env.SUPER_SYSTEGO_URL;
    const apiKey = process.env.SUPER_SYSTEGO_API_KEY;

    if (!baseURL) {
        throw new Error("SUPER_SYSTEGO_URL is not configured in .env");
    }
    if (!apiKey) {
        throw new Error("SUPER_SYSTEGO_API_KEY is not configured in .env");
    }

    return axios.create({
        baseURL,
        timeout: 10_000, // 10 seconds
        headers: {
            "Content-Type": "application/json",
            "X-Tenant-Api-Key": apiKey,
        },
    });
}

// ─── Public Helpers ────────────────────────────────────────────────

/**
 * Fetches the full tenant info from Super Systego.
 * Results are cached for 10 minutes.
 */
export async function getTenantInfo(): Promise<TenantInfo> {
    if (isCacheValid()) {
        return cachedData!;
    }

    try {
        const { data } = await getClient().get<{ success: boolean; data: any }>("/api/tenant/verify");

        // The Super Systego response shape: { success: true, data: { message, tenant, features, package } }
        const responseData = data?.data || data;

        const tenantInfo: TenantInfo = {
            tenant: responseData.tenant,
            features: responseData.features,
            package: responseData.package,
        };

        // Update cache
        cachedData = tenantInfo;
        cachedAt = Date.now();

        console.log(`[TenantService] Verified tenant: ${tenantInfo.tenant?.company_name} | Ecommerce: ${tenantInfo.features?.haveEcommerce} | MobileApp: ${tenantInfo.features?.haveMobileApp}`);

        return tenantInfo;
    } catch (error: any) {
        // If cache exists but is stale, return stale data rather than blocking the request
        if (cachedData) {
            console.warn(`[TenantService] Failed to refresh tenant info, using stale cache: ${error.message}`);
            return cachedData;
        }

        console.error(`[TenantService] Failed to verify tenant: ${error.message}`);
        throw new Error(`Failed to verify tenant subscription: ${error.message}`);
    }
}

/**
 * Returns only the feature flags.
 * Convenience wrapper around getTenantInfo().
 */
export async function getFeatures(): Promise<TenantFeatures> {
    const info = await getTenantInfo();
    return info.features;
}
