import { Issue } from './Issue'
import { Release } from './Release'

export class ChangeLog {
	static parse(content: string): ChangeLog {
    // TODO: actually parse instead of hard-coding!
    const releases = [
      new Release('v1.0.0', [
        new Issue(1)
      ])
    ]
		return new ChangeLog(releases)
	}

  constructor(public releases: Release[]) {}
}