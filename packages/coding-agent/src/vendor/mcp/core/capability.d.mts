import { Ft as PaginatedRequestParamsSchema } from "./schemas.mjs";
import * as z from "zod/v4";

//#region src/ext/skills/schemas.d.ts
declare const SkillDigestSchema: z.ZodString;
declare const SkillResourceEntrySchema: z.ZodObject<{
  /** Resource URI of the file. */
  uri: z.ZodString;
  /** SHA-256 digest of the file's raw bytes. */
  digest: z.ZodString;
  /** Length of the file's raw bytes. */
  size: z.ZodNumber;
}, z.core.$loose>;
declare const SkillFrontmatterSchema: z.ZodObject<{
  name: z.ZodString;
  description: z.ZodString;
}, z.core.$loose>;
declare const SkillResourcesSchema: z.ZodUnion<readonly [z.ZodArray<z.ZodObject<{
  /** Resource URI of the file. */
  uri: z.ZodString;
  /** SHA-256 digest of the file's raw bytes. */
  digest: z.ZodString;
  /** Length of the file's raw bytes. */
  size: z.ZodNumber;
}, z.core.$loose>>, z.ZodLiteral<"dynamic">]>;
declare const SkillSchema: z.ZodObject<{
  /** Resource URI of the skill's `SKILL.md`. */
  uri: z.ZodString;
  /** The `SKILL.md` frontmatter, verbatim. */
  frontmatter: z.ZodObject<{
    name: z.ZodString;
    description: z.ZodString;
  }, z.core.$loose>;
  /** Every file of the skill, or `"dynamic"`. */
  resources: z.ZodUnion<readonly [z.ZodArray<z.ZodObject<{
    /** Resource URI of the file. */
    uri: z.ZodString;
    /** SHA-256 digest of the file's raw bytes. */
    digest: z.ZodString;
    /** Length of the file's raw bytes. */
    size: z.ZodNumber;
  }, z.core.$loose>>, z.ZodLiteral<"dynamic">]>;
  _meta: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, z.core.$loose>;
declare const SkillCacheScopeSchema: z.ZodEnum<{
  private: "private";
  public: "public";
}>;
declare const ListSkillsResultSchema: z.ZodObject<{
  ttlMs: z.ZodNumber;
  cacheScope: z.ZodEnum<{
    private: "private";
    public: "public";
  }>;
  skills: z.ZodArray<z.ZodObject<{
    /** Resource URI of the skill's `SKILL.md`. */
    uri: z.ZodString;
    /** The `SKILL.md` frontmatter, verbatim. */
    frontmatter: z.ZodObject<{
      name: z.ZodString;
      description: z.ZodString;
    }, z.core.$loose>;
    /** Every file of the skill, or `"dynamic"`. */
    resources: z.ZodUnion<readonly [z.ZodArray<z.ZodObject<{
      /** Resource URI of the file. */
      uri: z.ZodString;
      /** SHA-256 digest of the file's raw bytes. */
      digest: z.ZodString;
      /** Length of the file's raw bytes. */
      size: z.ZodNumber;
    }, z.core.$loose>>, z.ZodLiteral<"dynamic">]>;
    _meta: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
  }, z.core.$loose>>;
  _meta: z.ZodOptional<z.ZodObject<{
    readonly "io.modelcontextprotocol/serverInfo": z.ZodCatch<z.ZodOptional<z.ZodObject<{
      version: z.ZodString;
      websiteUrl: z.ZodOptional<z.ZodString>;
      description: z.ZodOptional<z.ZodString>;
      icons: z.ZodOptional<z.ZodArray<z.ZodObject<{
        src: z.ZodString;
        mimeType: z.ZodOptional<z.ZodString>;
        sizes: z.ZodOptional<z.ZodArray<z.ZodString>>;
        theme: z.ZodOptional<z.ZodEnum<{
          dark: "dark";
          light: "light";
        }>>;
      }, z.core.$strip>>>;
      name: z.ZodString;
      title: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>>;
  }, z.core.$loose>>;
  nextCursor: z.ZodOptional<z.ZodString>;
}, z.core.$loose>;
declare const GetSkillRequestParamsSchema: z.ZodObject<{
  _meta: z.ZodOptional<z.ZodObject<{
    progressToken: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>;
    "io.modelcontextprotocol/related-task": z.ZodOptional<z.ZodObject<{
      taskId: z.ZodString;
    }, z.core.$strip>>;
  }, z.core.$loose>>;
  uri: z.ZodString;
}, z.core.$strip>;
declare const GetSkillResultSchema: z.ZodObject<{
  ttlMs: z.ZodNumber;
  cacheScope: z.ZodEnum<{
    private: "private";
    public: "public";
  }>;
  skill: z.ZodObject<{
    /** Resource URI of the skill's `SKILL.md`. */
    uri: z.ZodString;
    /** The `SKILL.md` frontmatter, verbatim. */
    frontmatter: z.ZodObject<{
      name: z.ZodString;
      description: z.ZodString;
    }, z.core.$loose>;
    /** Every file of the skill, or `"dynamic"`. */
    resources: z.ZodUnion<readonly [z.ZodArray<z.ZodObject<{
      /** Resource URI of the file. */
      uri: z.ZodString;
      /** SHA-256 digest of the file's raw bytes. */
      digest: z.ZodString;
      /** Length of the file's raw bytes. */
      size: z.ZodNumber;
    }, z.core.$loose>>, z.ZodLiteral<"dynamic">]>;
    _meta: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
  }, z.core.$loose>;
  _meta: z.ZodOptional<z.ZodObject<{
    readonly "io.modelcontextprotocol/serverInfo": z.ZodCatch<z.ZodOptional<z.ZodObject<{
      version: z.ZodString;
      websiteUrl: z.ZodOptional<z.ZodString>;
      description: z.ZodOptional<z.ZodString>;
      icons: z.ZodOptional<z.ZodArray<z.ZodObject<{
        src: z.ZodString;
        mimeType: z.ZodOptional<z.ZodString>;
        sizes: z.ZodOptional<z.ZodArray<z.ZodString>>;
        theme: z.ZodOptional<z.ZodEnum<{
          dark: "dark";
          light: "light";
        }>>;
      }, z.core.$strip>>>;
      name: z.ZodString;
      title: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>>;
  }, z.core.$loose>>;
}, z.core.$loose>;
declare const DirectoryResourceSchema: z.ZodObject<{
  uri: z.ZodString;
  description: z.ZodOptional<z.ZodString>;
  mimeType: z.ZodOptional<z.ZodString>;
  size: z.ZodOptional<z.ZodNumber>;
  annotations: z.ZodOptional<z.ZodObject<{
    audience: z.ZodOptional<z.ZodArray<z.ZodEnum<{
      assistant: "assistant";
      user: "user";
    }>>>;
    priority: z.ZodOptional<z.ZodNumber>;
    lastModified: z.ZodOptional<z.ZodISODateTime>;
  }, z.core.$strip>>;
  _meta: z.ZodOptional<z.ZodObject<{}, z.core.$loose>>;
  icons: z.ZodOptional<z.ZodArray<z.ZodObject<{
    src: z.ZodString;
    mimeType: z.ZodOptional<z.ZodString>;
    sizes: z.ZodOptional<z.ZodArray<z.ZodString>>;
    theme: z.ZodOptional<z.ZodEnum<{
      dark: "dark";
      light: "light";
    }>>;
  }, z.core.$strip>>>;
  name: z.ZodString;
  title: z.ZodOptional<z.ZodString>;
}, z.core.$loose>;
declare const ReadResourceDirectoryRequestParamsSchema: z.ZodObject<{
  _meta: z.ZodOptional<z.ZodObject<{
    progressToken: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>;
    "io.modelcontextprotocol/related-task": z.ZodOptional<z.ZodObject<{
      taskId: z.ZodString;
    }, z.core.$strip>>;
  }, z.core.$loose>>;
  cursor: z.ZodOptional<z.ZodString>;
  uri: z.ZodString;
}, z.core.$strip>;
declare const ReadResourceDirectoryResultSchema: z.ZodObject<{
  ttlMs: z.ZodNumber;
  cacheScope: z.ZodEnum<{
    private: "private";
    public: "public";
  }>;
  resources: z.ZodArray<z.ZodObject<{
    uri: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    mimeType: z.ZodOptional<z.ZodString>;
    size: z.ZodOptional<z.ZodNumber>;
    annotations: z.ZodOptional<z.ZodObject<{
      audience: z.ZodOptional<z.ZodArray<z.ZodEnum<{
        assistant: "assistant";
        user: "user";
      }>>>;
      priority: z.ZodOptional<z.ZodNumber>;
      lastModified: z.ZodOptional<z.ZodISODateTime>;
    }, z.core.$strip>>;
    _meta: z.ZodOptional<z.ZodObject<{}, z.core.$loose>>;
    icons: z.ZodOptional<z.ZodArray<z.ZodObject<{
      src: z.ZodString;
      mimeType: z.ZodOptional<z.ZodString>;
      sizes: z.ZodOptional<z.ZodArray<z.ZodString>>;
      theme: z.ZodOptional<z.ZodEnum<{
        dark: "dark";
        light: "light";
      }>>;
    }, z.core.$strip>>>;
    name: z.ZodString;
    title: z.ZodOptional<z.ZodString>;
  }, z.core.$loose>>;
  _meta: z.ZodOptional<z.ZodObject<{
    readonly "io.modelcontextprotocol/serverInfo": z.ZodCatch<z.ZodOptional<z.ZodObject<{
      version: z.ZodString;
      websiteUrl: z.ZodOptional<z.ZodString>;
      description: z.ZodOptional<z.ZodString>;
      icons: z.ZodOptional<z.ZodArray<z.ZodObject<{
        src: z.ZodString;
        mimeType: z.ZodOptional<z.ZodString>;
        sizes: z.ZodOptional<z.ZodArray<z.ZodString>>;
        theme: z.ZodOptional<z.ZodEnum<{
          dark: "dark";
          light: "light";
        }>>;
      }, z.core.$strip>>>;
      name: z.ZodString;
      title: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>>;
  }, z.core.$loose>>;
  nextCursor: z.ZodOptional<z.ZodString>;
}, z.core.$loose>;
declare const SkillsCapabilitySchema: z.ZodObject<{
  /** Whether the server serves `resources/directory/read`. */
  directoryRead: z.ZodOptional<z.ZodBoolean>;
}, z.core.$loose>;
//#endregion
//#region src/ext/skills/types.d.ts
/** One file of a skill, with what a host needs to verify it. */
type SkillResourceEntry = z.infer<typeof SkillResourceEntrySchema>;
/** A skill's `SKILL.md` frontmatter as JSON, verbatim. */
type SkillFrontmatter = z.infer<typeof SkillFrontmatterSchema>;
/** A skill's complete file list, or `"dynamic"`. */
type SkillResources = z.infer<typeof SkillResourcesSchema>;
/** One skill entry, as `skills/list` and `skills/get` carry it. */
type Skill = z.infer<typeof SkillSchema>;
/** `public` or `private`. */
type SkillCacheScope = z.infer<typeof SkillCacheScopeSchema>;
/** Params of `skills/list`. */
type ListSkillsRequestParams = z.infer<typeof PaginatedRequestParamsSchema>;
/** Result of `skills/list`. */
type ListSkillsResult = z.infer<typeof ListSkillsResultSchema>;
/** Params of `skills/get`. */
type GetSkillRequestParams = z.infer<typeof GetSkillRequestParamsSchema>;
/** Result of `skills/get`. */
type GetSkillResult = z.infer<typeof GetSkillResultSchema>;
/** A child of a directory resource. */
type DirectoryResource = z.infer<typeof DirectoryResourceSchema>;
/** Params of `resources/directory/read`. */
type ReadResourceDirectoryRequestParams = z.infer<typeof ReadResourceDirectoryRequestParamsSchema>;
/** Result of `resources/directory/read`. */
type ReadResourceDirectoryResult = z.infer<typeof ReadResourceDirectoryResultSchema>;
/** The value at `capabilities.extensions["io.modelcontextprotocol/skills"]`. */
type SkillsCapability = z.infer<typeof SkillsCapabilitySchema>;
//#endregion
//#region src/ext/skills/capability.d.ts
/**
 * The shape this module reads capabilities out of. Declared structurally so
 * the helper stays in the runtime-neutral core package: the nominal
 * `ServerCapabilities` type lives downstream, and every value of it satisfies
 * this.
 */
interface CapabilitiesWithExtensions {
  extensions?: Record<string, unknown>;
}
/**
 * Reads the Skills extension capability out of a peer's advertised
 * capabilities, returning `undefined` when the peer does not advertise the
 * extension or advertises a malformed value.
 *
 * Shared by both roles: servers use it to check what they published, clients
 * to gate `skills/list` / `skills/get` on negotiation.
 */
declare function skillsCapabilityOf(capabilities: CapabilitiesWithExtensions | undefined): SkillsCapability | undefined;
//#endregion
export { SkillDigestSchema as C, SkillSchema as D, SkillResourcesSchema as E, SkillsCapabilitySchema as O, SkillCacheScopeSchema as S, SkillResourceEntrySchema as T, GetSkillRequestParamsSchema as _, GetSkillResult as a, ReadResourceDirectoryRequestParamsSchema as b, ReadResourceDirectoryRequestParams as c, SkillCacheScope as d, SkillFrontmatter as f, DirectoryResourceSchema as g, SkillsCapability as h, GetSkillRequestParams as i, ReadResourceDirectoryResult as l, SkillResources as m, skillsCapabilityOf as n, ListSkillsRequestParams as o, SkillResourceEntry as p, DirectoryResource as r, ListSkillsResult as s, CapabilitiesWithExtensions as t, Skill as u, GetSkillResultSchema as v, SkillFrontmatterSchema as w, ReadResourceDirectoryResultSchema as x, ListSkillsResultSchema as y };
