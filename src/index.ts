import { Probot } from 'probot'
import { RestEndpointMethodTypes } from '@octokit/plugin-rest-endpoint-methods'
import { ChangeLog } from './model/ChangeLog'

console.log('starting up...')

export = (app: Probot) => {
  app.on('push', async (context) => {
    app.log.info(context)

    if (
      context.payload.ref !==
      `refs/heads/${context.payload.repository.default_branch}`
    ) {
      app.log.info(`Ignoring push to non-default-branch ${context.payload.ref}`)
      return
    }

    // STEPS:

    // 1. Read the body of the changelog file
    // --------------------------------------

    const owner: string =
      context.payload.organization?.login ||
      context.payload.repository.owner.login ||
      ''
    const repo: string = context.payload.repository.name
    const ref: string = context.payload.after
    const currentUser = await context.octokit.apps.getAuthenticated()
    let data: any
    try {
      ;({ data } = await context.octokit.repos.getContent({
        path: 'CHANGELOG.md',
        owner,
        repo,
        ref
      }))
    } catch (err: any) {
      // create an issue if CHANGELOG.md cannot be found
      if (err.status == 404) {
        const req: RestEndpointMethodTypes['issues']['listForRepo']['parameters'] =
          {
            repo,
            owner,
            creator: `${currentUser.data.name}[bot]`
          }

        const allIssues: any[] = await context.octokit.paginate(
          context.octokit.issues.listForRepo,
          req,
          ({ data }) => data
        )

        if (
          !allIssues.some((issue) => issue.title === 'CHANGELOG.md is missing')
        ) {
          const issue: RestEndpointMethodTypes['issues']['create']['parameters'] =
            {
              owner,
              repo,
              title: 'CHANGELOG.md is missing',
              body: 'You really should have a CHANGELOG.md'
            }
          await context.octokit.issues.create(issue)
        }

        return
      }
    }
    // narrow type to content-file; `data` could be other types like a directory listing
    if ('content' in data) {
      const content = Buffer.from(data.content, 'base64').toString()
      app.log.info(content)

      // 2. Parse it, to relate releases to issues
      // -----------------------------------------
      const changeLog = await ChangeLog.parse(content)

      // 3. Comment on issues
      // --------------------
      for (const release of changeLog.releases) {
        // Do not add comments for unreleased issues (yet)
        if (release.name.toLowerCase().includes('unreleased')) {
          continue
        }
        for (const issue of release.issues) {
          const request: RestEndpointMethodTypes['issues']['listComments']['parameters'] =
            {
              owner,
              repo,
              issue_number: issue.number
            }

          const allComments: any[] = await context.octokit.paginate(
            context.octokit.issues.listComments,
            request,
            ({ data }) => data
          )

          const commentToAdd = `This was released in ${release.name}`

          const hasPreviousComment: boolean = allComments.some((comment) => {
            return (
              comment.body === commentToAdd &&
              comment.user.login === `${currentUser.data.name}[bot]`
            )
          })

          if (hasPreviousComment) {
            app.log.debug(
              `Not commenting on issue ${issue.number} since it already has a comment about this release`
            )
            continue
          }

          const issueComment: RestEndpointMethodTypes['issues']['createComment']['parameters'] =
            {
              owner,
              repo,
              issue_number: issue.number,
              body: commentToAdd
            }
          await context.octokit.issues.createComment(issueComment)
        }
      }
    }
  })
}
