export class GitHubHeadingAnchor {
  static to(heading: string): GitHubHeadingAnchor {
    return new GitHubHeadingAnchor(
      heading
        .trim()
        .toLowerCase()
        .replace(/[^\w\- ]+/g, '')
        .replace(/\s/g, '-')
        .replace(/\-+$/, '')
    )
  }

  constructor(private readonly value: string) {}

  public valueOf(): string {
    return this.value
  }
}
