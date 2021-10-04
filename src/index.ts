import { Probot } from "probot";

export = (app: Probot) => {
  app.on("push", async (context) => {

    if (context.payload.ref === 'refs/heads/master'){
      app.log.info(context);

      //context.payload.commits[0]
    }


//    await context.octokit.issues.createComment(issueComment);
  });
  // For more information on building apps:
  // https://probot.github.io/docs/

  // To get your app running against GitHub, see:
  // https://probot.github.io/docs/development/
};
