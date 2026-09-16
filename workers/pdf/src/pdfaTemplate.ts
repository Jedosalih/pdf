/**
 * Debian's `libgs-common` package (a transitive dependency of the
 * `ghostscript` package already installed in this image) ships this sRGB
 * ICC profile at a fixed path — verified empirically inside the real
 * running container (`docker exec ... find / -iname '*srgb*.icc'`) rather
 * than assumed, per docs/DECISIONS.md. No extra apt package needed.
 */
export const SRGB_ICC_PROFILE_PATH = "/usr/share/color/icc/ghostscript/srgb.icc";

/**
 * Adapted from Ghostscript's own shipped example
 * (`/usr/share/ghostscript/<version>/lib/PDFA_def.ps`) rather than
 * hand-written from scratch — only the ICC profile path is substituted in.
 * Copied into our own repo (not read from the version-numbered system path
 * at runtime) so this doesn't silently break on a future Ghostscript
 * version bump inside the base image.
 */
export function buildPdfaDefPs(iccProfilePath: string): string {
  return `%!
[ /Title (Title)
  /DOCINFO pdfmark

/ICCProfile (${iccProfilePath})
def

[/_objdef {icc_PDFA} /type /stream /OBJ pdfmark
[{icc_PDFA}
<<
  /N 3
>> /PUT pdfmark
[
{icc_PDFA}
{ICCProfile (r) file} stopped
{
  cleartomark
}
{
  /PUT pdfmark
  [/_objdef {OutputIntent_PDFA} /type /dict /OBJ pdfmark
  [{OutputIntent_PDFA} <<
    /Type /OutputIntent
    /S /GTS_PDFA1
    /DestOutputProfile {icc_PDFA}
    /OutputConditionIdentifier (sRGB)
  >> /PUT pdfmark
  [{Catalog} <</OutputIntents [ {OutputIntent_PDFA} ]>> /PUT pdfmark
} ifelse
`;
}
