import { Issue } from './Issue'

export class Release {
  constructor(public name: string, public issues: Issue[]) {}
}
