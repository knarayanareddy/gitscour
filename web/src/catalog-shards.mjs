// Shared by the Explorer and smoke test. Legacy catalogs omit shard_parts.
export function slugify(text) {
  return (text || 'other-general').toLowerCase().replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'other-general';
}

export function detailShard(domain, id, parts) {
  const slug = slugify(domain);
  const count = parts?.[slug] || 1;
  return count > 1 ? `${slug}--${id % count}` : slug;
}
