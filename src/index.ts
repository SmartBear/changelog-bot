import { Probot } from "probot";

console.log("starting up...")

export = (app: Probot) => {
  app.on("push", async (context) => {

    console.log("got a push!")
    app.log.info(context);
    if (context.payload.ref === 'refs/heads/master'){

      //context.payload.commits[0]
    }


//    await context.octokit.issues.createComment(issueComment);
  });
  // For more information on building apps:
  // https://probot.github.io/docs/

  // To get your app running against GitHub, see:
  // https://probot.github.io/docs/development/
};
