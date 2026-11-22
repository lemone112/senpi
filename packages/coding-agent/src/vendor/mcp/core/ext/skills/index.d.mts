import { Ft as PaginatedRequestParamsSchema } from "../../schemas.mjs";
import { C as SkillDigestSchema, D as SkillSchema, E as SkillResourcesSchema, O as SkillsCapabilitySchema, S as SkillCacheScopeSchema, T as SkillResourceEntrySchema, _ as GetSkillRequestParamsSchema, a as GetSkillResult, b as ReadResourceDirectoryRequestParamsSchema, c as ReadResourceDirectoryRequestParams, d as SkillCacheScope, f as SkillFrontmatter, g as DirectoryResourceSchema, h as SkillsCapability, i as GetSkillRequestParams, l as ReadResourceDirectoryResult, m as SkillResources, n as skillsCapabilityOf, o as ListSkillsRequestParams, p as SkillResourceEntry, r as DirectoryResource, s as ListSkillsResult, t as CapabilitiesWithExtensions, u as Skill, v as GetSkillResultSchema, w as SkillFrontmatterSchema, x as ReadResourceDirectoryResultSchema, y as ListSkillsResultSchema } from "../../capability.mjs";

//#region src/ext/skills/constants.d.ts

/**
 * Wire constants for the MCP Skills extension (SEP-2640).
 *
 * Runtime-neutral: this module imports nothing.
 */
/** The identifier a server advertises in `ServerCapabilities.extensions`. */
declare const SKILLS_EXTENSION_ID = "io.modelcontextprotocol/skills";
/** Enumerates the skills a server serves. */
declare const SKILLS_LIST_METHOD = "skills/list";
/** Returns one skill's entry by its `SKILL.md` URI, listed or not. */
declare const SKILLS_GET_METHOD = "skills/get";
/** Lists the direct children of a directory resource (gated by `directoryRead`). */
declare const RESOURCES_DIRECTORY_READ_METHOD = "resources/directory/read";
/** The `mimeType` of a directory resource. */
declare const DIRECTORY_MIME_TYPE = "inode/directory";
/**
 * Per-skill interoperability limits. Hosts MUST accept skills up to these;
 * servers SHOULD NOT publish skills over them.
 */
declare const SKILL_LIMITS: Readonly<{
  files: number;
  bytes: number;
}>;
/** `sha256:` followed by 64 lowercase hexadecimal characters. */
declare const SKILL_DIGEST_PATTERN: RegExp;
//#endregion
export { type CapabilitiesWithExtensions, DIRECTORY_MIME_TYPE, type DirectoryResource, DirectoryResourceSchema, type GetSkillRequestParams, GetSkillRequestParamsSchema, type GetSkillResult, GetSkillResultSchema, type ListSkillsRequestParams, PaginatedRequestParamsSchema as ListSkillsRequestParamsSchema, type ListSkillsResult, ListSkillsResultSchema, RESOURCES_DIRECTORY_READ_METHOD, type ReadResourceDirectoryRequestParams, ReadResourceDirectoryRequestParamsSchema, type ReadResourceDirectoryResult, ReadResourceDirectoryResultSchema, SKILLS_EXTENSION_ID, SKILLS_GET_METHOD, SKILLS_LIST_METHOD, SKILL_DIGEST_PATTERN, SKILL_LIMITS, type Skill, type SkillCacheScope, SkillCacheScopeSchema, SkillDigestSchema, type SkillFrontmatter, SkillFrontmatterSchema, type SkillResourceEntry, SkillResourceEntrySchema, type SkillResources, SkillResourcesSchema, SkillSchema, type SkillsCapability, SkillsCapabilitySchema, skillsCapabilityOf };
