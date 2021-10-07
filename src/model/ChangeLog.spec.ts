import { assertThat, containsInAnyOrder, equalTo } from 'hamjest'
import { ChangeLog } from './ChangeLog'
import { Release } from './Release'
import { Issue } from './Issue'
import { readFileSync } from 'fs'
import { resolve } from 'path'

describe(ChangeLog.name, () => {
  it('parses a changelog with a single release', async () => {
    const changeLog = await ChangeLog.parse(
      '## [7.0.0](https://github.com/cucumber/cucumber-ruby/compare/v6.1.0...v7.0.0) (2021-07-19)'
    )
    assertThat(changeLog.releases[0], equalTo(new Release('7.0.0', [])))
  })

  it('parses a changelog with a single release and a single issue', async () => {
    const content = `
## [7.0.0](https://github.com/cucumber/cucumber-ruby/compare/v6.1.0...v7.0.0) (2021-07-19)
### Added
* Add a feature, fixes #1
    `
    const changeLog = await ChangeLog.parse(content)
    assertThat(
      changeLog.releases[0],
      equalTo(new Release('7.0.0', [new Issue(1)]))
    )
  })

  it('parses a changelog with multiple releases and multiple issues', async () => {
    const content = `
## [7.0.0](https://github.com/cucumber/cucumber-ruby/compare/v6.1.0...v7.0.0) (2021-07-19)
### Added
* Add a feature, fixes (#1)
* Add a feature, fixes (#2)
## [6.1.0](https://github.com/cucumber/cucumber-ruby/compare/v5.1.0...v6.1.0) (2020-07-19)
### Added
* Add a feature, fixes [#3]
* Add a feature, fixes #4
    `
    const changeLog = await ChangeLog.parse(content)
    assertThat(
      changeLog.releases[0],
      equalTo(new Release('7.0.0', [new Issue(1), new Issue(2)]))
    )
    assertThat(
      changeLog.releases[1],
      equalTo(new Release('6.1.0', [new Issue(3), new Issue(4)]))
    )
  })

  it('can handle [Unreleased]', async () => {
    const content = `
## [Unreleased]
### Added
* Add a feature, fixes (#1)
* Add a feature, fixes (#2)
## [6.1.0](https://github.com/cucumber/cucumber-ruby/compare/v5.1.0...v6.1.0) (2020-07-19)
### Added
* Add a feature, fixes [#3]
* Add a feature, fixes #4
    `
    const changeLog = await ChangeLog.parse(content)
    assertThat(
      changeLog.releases[0],
      equalTo(new Release('[Unreleased]', [new Issue(1), new Issue(2)]))
    )
    assertThat(
      changeLog.releases[1],
      equalTo(new Release('6.1.0', [new Issue(3), new Issue(4)]))
    )
  })

  it('can parse a big ugly changelog', async () => {
    const content = readFileSync(
      resolve(__dirname, '../..', 'test/fixtures/cucumber-js-changelog.md')
    ).toString()
    const changeLog = await ChangeLog.parse(content)
    assertThat(changeLog.releases[1].name, equalTo('7.3.0'))
    assertThat(
      changeLog.releases[1].issues.map((issue) => issue.number),
      containsInAnyOrder(
        1302,
        1408,
        1534,
        1568,
        1579,
        1621,
        1645,
        1651,
        1667,
        1669,
        1672,
        1690
      )
    )
  })

  it('can find issues with a link but no preceding "#"', async () => {
    const content = `
## [1.2.3]
### Fixed
- It's broken #1
- It's even more broken [2](https://github.com/owner/repo/issues/2)
- Here's a fix [3](https://github.com/owner/repo/pulls/3)
    `
    const changeLog = await ChangeLog.parse(content)
    assertThat(
      changeLog.releases[0].issues.map((issue) => issue.number),
      equalTo([1, 2, 3])
    )
  })

  it('does not return duplicates', async () => {
    const content = `
## [1.2.3]
### Fixed
- It's broken #1
- It's broken again #1
- It's even more broken [#2](https://github.com/owner/repo/issues/2)
- Here's a fix [3](https://github.com/owner/repo/pulls/3)
- Here's a fix again [#3](https://github.com/owner/repo/pulls/3)
    `
    const changeLog = await ChangeLog.parse(content)
    assertThat(
      changeLog.releases[0].issues.map((issue) => issue.number),
      equalTo([1, 2, 3])
    )
  })
})
