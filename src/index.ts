import { Probot } from "probot";

console.log("starting up...")

export = (app: Probot) => {
  app.on("push", async (context) => {
    app.log.info(context);

    if (context.payload.ref !== `refs/heads/${context.payload.repository.default_branch}`){
      app.log.info(`Ignoring push to non-default-branch ${context.payload.ref}`)
      return
    }

    // TODO:
    // 1. Read the body of the changelog file
    const owner: string = context.payload.organization?.login || ""
    const repo: string = context.payload.repository.name
    const changelogBody = context.octokit.repos.getContent({ path: "CHANGELOG.md", owner, repo })

    app.log.info(changelogBody)
    
    // 2. Parse it, to relate releases to issues
    // 3. Comment on issues

//    await context.octokit.issues.createComment(issueComment);
  });
};
