import { buildChangelogDraftFromGit } from "../src/lib/changelog-from-git";

async function main() {
  const days = Number(process.argv[2] ?? 7);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const draft = await buildChangelogDraftFromGit({ since });
  console.log("=".repeat(78));
  console.log("TITLE:", draft.title);
  console.log("SINCE:", draft.since);
  console.log("COMMITS:", draft.commits.length);
  console.log("=".repeat(78));
  console.log(draft.bodyMd);
  console.log("=".repeat(78));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
