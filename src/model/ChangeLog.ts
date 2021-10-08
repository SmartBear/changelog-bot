import { Issue } from './Issue'
import { Release } from './Release'
import parseChangeLog from 'changelog-parser'
import removeMarkdown from 'remove-markdown'

export class ChangeLog {
  static async parse(content: string): Promise<ChangeLog> {
    try {
      const result = await parseChangeLog({
        text: content
      })
      const releases = result.versions.map((version) => {
        const issues = ChangeLog.findIssues(version.body)
        return new Release(
          version.version || version.title,
          removeMarkdown(version.title),
          issues
        )
      })
      return new ChangeLog(releases)
    } catch (error) {
      console.log(error)
      return new ChangeLog([])
    }
  }

  private static findIssues(body: string) {
    const hashMarked = Array.from(body.matchAll(new RegExp('#(\\d+)', 'mg')))
    const linked = Array.from(
      body.matchAll(
        new RegExp('\\bhttps://github.com/.+/(?:pulls|issues)/(\\d+)\\b', 'mg')
      )
    )
    const matches = [
      ...Array.from(hashMarked || []),
      ...Array.from(linked || [])
    ]
    if (!matches) {
      return []
    }
    return [
      ...Array.from(new Set(matches.map(([_, match]) => parseInt(match))))
    ].map((number) => new Issue(number))
  }

  constructor(public releases: Release[]) {}
}
