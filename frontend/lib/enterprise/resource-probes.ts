import { constants as fsConstants } from "node:fs";
import { access, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fetchWithTimeout } from "./timeout";
import type { HealthProbeOutput } from "./types";

export interface LocalDirectoryProbeOptions {
  name: string;
  root?: string;
  requireContent?: boolean;
  requireWritable?: boolean;
}

export async function probeLocalDirectory(
  options: LocalDirectoryProbeOptions,
): Promise<HealthProbeOutput> {
  if (!options.root?.trim()) {
    return {
      status: "unhealthy",
      message: `${options.name} root is not configured.`,
    };
  }

  const resolved = path.resolve(options.root.trim());

  try {
    const details = await stat(resolved);
    if (!details.isDirectory()) {
      return {
        status: "unhealthy",
        message: `${options.name} root is not a directory.`,
        details: { root: resolved },
      };
    }

    const accessMode = options.requireWritable
      ? fsConstants.R_OK | fsConstants.W_OK
      : fsConstants.R_OK;
    await access(resolved, accessMode);

    if (options.requireContent) {
      const entries = await readdir(resolved);
      if (entries.length === 0) {
        return {
          status: "unhealthy",
          message: `${options.name} root exists but contains no governed content.`,
          details: { root: resolved, entryCount: 0 },
        };
      }

      return {
        status: "healthy",
        message: `${options.name} local root is available.`,
        details: { root: resolved, entryCount: entries.length },
      };
    }

    return {
      status: "healthy",
      message: `${options.name} local root is available.`,
      details: { root: resolved },
    };
  } catch (error) {
    return {
      status: "unhealthy",
      message: `${options.name} local root is not accessible.`,
      details: {
        root: resolved,
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

export async function probeHealthEndpoint(input: {
  name: string;
  healthUrl: string;
  timeoutMs: number;
  headers?: Record<string, string>;
}): Promise<HealthProbeOutput> {
  try {
    const response = await fetchWithTimeout(
      input.healthUrl,
      {
        cache: "no-store",
        headers: {
          accept: "application/json",
          ...(input.headers || {}),
        },
      },
      input.timeoutMs,
    );

    if (!response.ok) {
      return {
        status: "unhealthy",
        message: `${input.name} health endpoint returned HTTP ${response.status}.`,
        details: { healthUrl: input.healthUrl, statusCode: response.status },
      };
    }

    return {
      status: "healthy",
      message: `${input.name} health endpoint is responsive.`,
      details: { healthUrl: input.healthUrl, statusCode: response.status },
    };
  } catch (error) {
    return {
      status: "unhealthy",
      message: `${input.name} health endpoint could not be reached.`,
      details: {
        healthUrl: input.healthUrl,
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
}
