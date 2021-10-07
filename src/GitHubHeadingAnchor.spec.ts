import { GitHubHeadingAnchor } from './GitHubHeadingAnchor'
import { assertThat, equalTo } from 'hamjest'

describe(GitHubHeadingAnchor.name, () => {
  it('renders a regular heading to lower case with dashes', () => {
    assertThat(`${GitHubHeadingAnchor.to('My heading')}`, equalTo('my-heading'))
  })

  it('renders a semantic version with the dots removed', () => {
    assertThat(`${GitHubHeadingAnchor.to('1.2.3')}`, equalTo('123'))
  })

  it('renders a semantic version and date with the dots and parentheses removed', () => {
    assertThat(
      `${GitHubHeadingAnchor.to('1.2.3 (2021-08-24')}`,
      equalTo('123-2021-08-24')
    )
  })

  it('ignores square brackets', () => {
    assertThat(`${GitHubHeadingAnchor.to('[1.2.3]')}`, equalTo('123'))
  })
})
