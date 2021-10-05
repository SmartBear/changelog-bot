import { Issue } from './Issue'
import { Release } from './Release'
import parseChangeLog from 'changelog-parser'

type ParsedVersion = {
  version: string
  title: string
  parsed: { _: string[] }
}

type ParsedChangeLog = {
  versions: ParsedVersion[]
}

export class ChangeLog {
  static async parse(content: string): Promise<ChangeLog> {
    const releases: Release[] = []

    try {
      const result: ParsedChangeLog = (await parseChangeLog(
        content
      )) as ParsedChangeLog
      result.versions.forEach((version: ParsedVersion) => {
        const release = new Release(version.version || version.title, [])

        const rowIssues = ChangeLog.findIssues(version)
        release.issues.push(...rowIssues)
        releases.push(release)
      })
    } catch (error) {
      console.log(error)
    }
    return new ChangeLog(releases)
  }

  private static findIssues(version: ParsedVersion) {
    const rowIssues: Issue[] = []
    version.parsed._.forEach((row) => {
      const re = new RegExp('(#\\d+)')
      const matches = re.exec(row)
      if (matches) {
        const issueNumber: number = parseInt(matches[0].replace('#', ''))
        rowIssues.push(new Issue(issueNumber))
      }
    })
    return rowIssues
  }

  constructor(public releases: Release[]) {}
}
