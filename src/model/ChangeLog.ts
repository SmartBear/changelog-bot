import { Issue } from './Issue'
import { Release } from './Release'

const parseChangeLog = require('changelog-parser')

export class ChangeLog {
  static async parse(content: string): Promise<ChangeLog> {
    const releases: Release[] = []

    try {
      const result: object = await parseChangeLog({ text: content })
      // @ts-ignore
      result.versions.forEach((version: any) => {
        const release = new Release(version.version || version.title, []);

        let rowIssues = ChangeLog.findIssues(version);
        release.issues.push(...rowIssues);
        releases.push(release);
      })
    } catch (error) {
      console.log(error)
    }
    return new ChangeLog(releases)
  }

  private static findIssues(version: any) {
    let rowIssues: Issue[] = [];
    version.parsed._.forEach((row: any) => {
      const re = new RegExp('(#\\d+)');
      const matches = re.exec(row)
      if (matches) {
        const issueNumber: number = parseInt(matches[0].replace("#", ""))
        rowIssues.push(new Issue(issueNumber))
      }
    })
    return rowIssues;
  }

  constructor(public releases: Release[]) {
  }
}