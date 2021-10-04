import { Probot } from "probot";

console.log("starting up...")

export = (app: Probot) => {
  app.on("push", async (context) => {
    app.log.info(context);

    if (context.payload.ref !== `refs/heads/${context.payload.repository.default_branch}`){
      app.log.info(`Ignoring push to non-default-branch ${context.payload.ref}`)
      return
    }

    // STEPS:

    // 1. Read the body of the changelog file
    // --------------------------------------

    const owner: string = context.payload.organization?.login || ""
    const repo: string = context.payload.repository.name
    const ref: string = context.payload.after
    // TODO: handle when there is no changelog - we get a 404 error here
    const { data } = await context.octokit.repos.getContent({ path: "CHANGELOG.md", owner, repo, ref })

    // narrow type to content-file
    if ("content" in data) {
      const content = Buffer.from(data.content, "base64").toString()
      app.log.info(content)
    }
    
    // 2. Parse it, to relate releases to issues
    // -----------------------------------------
  
    // TODO...

    // 3. Comment on issues
    // --------------------

    // await context.octokit.issues.createComment(issueComment);
  });
};
