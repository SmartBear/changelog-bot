import { Issue } from './Issue'
import { Release } from './Release'

const parseChangeLog = require('changelog-parser')

export class ChangeLog {
  static async parse(content: string): Promise<ChangeLog> {
    const releases: Release[] = []

    // TODO: how to make this thing sync?
    await parseChangeLog({ text: content })
      .then(function (result: any) {
        result.versions.forEach((version: any) => {
          console.log("found version", version)
          const release = new Release(version.version, []);

          let rowIssues = ChangeLog.findIssues(version);
          release.issues.push(...rowIssues);
          releases.push(release);
        })
        console.log("All releases:", JSON.stringify(releases, null, 2));
      })
      .catch(function (err: any) {
        console.error(err)
      });

    console.log("releases", releases)

    return new ChangeLog(releases)
  }

  private static findIssues(version: any) {
    let rowIssues: Issue[] = [];
    version.parsed._.forEach((row: any) => {
      console.log("Row:", row);
      const re = new RegExp('(#\\d+)');
      const matches = re.exec(row)
      if (matches) {
        const issueNumber: number = parseInt(matches[0].replace("#", ""))
        console.log("Found issue:", issueNumber);
        rowIssues.push(new Issue(issueNumber))
      }
    })
    return rowIssues;
  }

  constructor(public releases: Release[]) {
  }
}