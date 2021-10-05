import { Probot } from "probot";
import { RestEndpointMethodTypes } from '@octokit/plugin-rest-endpoint-methods'
import { ChangeLog } from './model/ChangeLog'

console.log("starting up...")

export = (app: Probot) => {
  app.on("push", async (context) => {
    app.log.info(context);

    if (context.payload.ref !== `refs/heads/${context.payload.repository.default_branch}`) {
      app.log.info(`Ignoring push to non-default-branch ${context.payload.ref}`)
      return
    }

    // STEPS:

    // 1. Read the body of the changelog file
    // --------------------------------------

    const owner: string = context.payload.organization?.login || context.payload.repository.owner.login || ""
    const repo: string = context.payload.repository.name
    const ref: string = context.payload.after
    // TODO: handle when there is no changelog - we get a 404 error here
    const { data } = await context.octokit.repos.getContent({ path: "CHANGELOG.md", owner, repo, ref })

    // narrow type to content-file; `data` could be other types like a directory listing
    if ("content" in data) {
      const content = Buffer.from(data.content, "base64").toString()
      app.log.info(content)

      // 2. Parse it, to relate releases to issues
      // -----------------------------------------
      const changeLog = await ChangeLog.parse(content)

      // 3. Comment on issues
      // --------------------
      for (const release of changeLog.releases) {
        // Do not add comments for unreleased issues (yet)
        if (release.name.toLowerCase().includes('unreleased')) {
          continue;
        }
        for (const issue of release.issues) {
          const request: RestEndpointMethodTypes["issues"]["listComments"]["parameters"] = {
            owner,
            repo,
            issue_number: issue.number
          }

          const allComments: any[] = await context.octokit.paginate(
            context.octokit.issues.listComments,
            request,
            ({ data }) => data
          );

          const commentToAdd = `This was released in ${release.name}`;

          const hasPreviousComment: boolean = allComments.some(comment => {
            return comment.body === commentToAdd
          });

          if (hasPreviousComment) {
            console.log("Not commenting on issue" + issue.number)
            continue;
          }

          const issueComment: RestEndpointMethodTypes["issues"]["createComment"]["parameters"] = {
            owner,
            repo,
            issue_number: issue.number,
            body: commentToAdd
          }
          await context.octokit.issues.createComment(issueComment);
        }
      }
    }
  });
};
