let fuse

const fuseOptions = {
    includeMatches: true,
    findAllMatches: true,
    includeScore: true,
    threshold: 0,
    ignoreLocation: true,
    maxPatternLength: 32,
    minMatchCharLength: 3,
    useExtendedSearch: true,
    keys: [
        {
            name: 'title',
            weight: 15,
        },
        {
            name: 'subtitle',
            weight: 10,
        },
        {
            name: 'content',
            weight: 5,
        },
    ],
}

fetch('/index.json')
    .then((data) => data.json())
    .then((data) => {
        fuse = new Fuse(data, fuseOptions)
        initSearchEvents()
    })

const initSearchEvents = () => {
    const searchElements = document.querySelectorAll('.search')
    const searchInputs = document.querySelectorAll('.search__input')
    const searchIcons = document.querySelectorAll('.search__icon--search')
    const searchClearIcons = document.querySelectorAll('.search__icon--clear')

    searchIcons.forEach((searchIcon) =>
        searchIcon.addEventListener('click', (e) =>
            e.target.closest('.search').querySelector('.search__input').focus(),
        ),
    )
    searchClearIcons.forEach((searchClearIcon) =>
        searchClearIcon.addEventListener('mousedown', () => {
            // mousedown is before blur, 'click' wouldn't work because after blur the icon disappears
            updateFromInput(null)
        }),
    )

    searchInputs.forEach((searchInput) => {
        searchInput.addEventListener('focusin', () =>
            searchElements.forEach((searchElement) => searchElement.classList.add('search--active')),
        )
        searchInput.addEventListener('focusout', (event) => {
            if (!event.target.value) {
                searchElements.forEach((searchElement) => searchElement.classList.remove('search--active'))
            }
        })
        searchInput.addEventListener('keyup', (event) => {
            if (event.keyCode === 27) {
                // ESC
                updateFromInput(null)
                event.stopImmediatePropagation()
            }
        })
        searchInput.addEventListener(
            'keyup',
            debounce((event) => updateFromInput(event.target.value), 250),
        )
    })

    updateFromUrl()

    window.addEventListener('popstate', () => updateFromUrl())
}

const updateFromInput = (query) => {
    updateUrl(query)
    updateInputs(query)
    window.setTimeout(() => updateResults(query))
}

const updateFromUrl = () => {
    const query = decodeURIComponent((window.location.search || '').slice(3)) || null
    if (window.location.search.indexOf('utm_') < 0) {
        updateInputs(query)
        window.setTimeout(() => updateResults(query))
    }
}

const updateUrl = (query) =>
    window.history.pushState(
        '',
        document.title,
        window.location.toString().substring(0, window.location.toString().indexOf('?')) +
            (query ? '?q=' + encodeURIComponent(query) : ''),
    )

const updateResults = (query) => {
    let result
    try {
        result = getResults(query)
    } catch (error) {
        result = error
    }
    const searchResultsElement = document.getElementById('search-results')
    searchResultsElement.innerHTML = ''
    if (result) searchResultsElement.append(getResultDomNodes(result, query))
}

const updateInputs = (query) => {
    const searchInputs = document.querySelectorAll('.search__input')
    searchInputs.forEach((searchInput) => {
        searchInput.value = query
        query === null ? searchInput.blur() : query && document.querySelector('.search').classList.add('search--active')
    })
}

function createElementFromHTML(htmlString) {
    var div = document.createElement('div')
    div.innerHTML = htmlString.trim()
    return div.firstChild
}

const getResultDomNodes = (resultList, query) => {
    if (resultList instanceof Error)
        return createElementFromHTML(
            `<div class="no-results-message">Invalid search query: ${resultList.message}</div>`,
        )

    if (!resultList.length)
        return createElementFromHTML(`<div class="no-results-message">No results matching "${query}"</div>`)

    const orderByStartPosition = (a, b) => a.start - b.start

    const collectSnippetPositions = (contentLength, all, p) => {
        const charsBefore = 30
        const charsAfter = 30
        const maxSnippetLength = 200

        const start = Math.max(p.start - charsBefore, 0)
        const end = Math.min(p.start + p.length + charsAfter, contentLength)

        const prev = all[all.length - 1]
        const isOverlappingWithPrevious = prev && prev.start + prev.length > start
        if (isOverlappingWithPrevious) {
            const newLength = end - prev.start
            if (newLength > maxSnippetLength) {
                return all
            }
            prev.length = newLength
            prev.keywords.push({ start: p.start - prev.start, length: p.length })
        } else {
            all.push({
                start: start,
                length: end - start,
                keywords: [{ start: p.start - start, length: p.length }],
            })
        }

        return all
    }

    const getSnippet = (content, s) => {
        let c = content.substr(s.start, s.length + 1)
        const m = c.match(new RegExp('|', 'g'))

        const isStartOfContent = s.start === 0
        const firstKw = s.keywords[0]
        const start = isStartOfContent ? 0 : Math.min(firstKw.start, m ? c.indexOf(m[0]) + m[0].length : 0)
        const lastKw = s.keywords[s.keywords.length - 1]

        const isEndOfContent = s.start + s.length === content.length
        const end = isEndOfContent
            ? c.length + 1
            : Math.max(lastKw.start + lastKw.length, m ? c.lastIndexOf(m[m.length - 1]) : c.length + 1)

        c = c.substring(start, end)

        return Object.assign({}, s, {
            content: c,
            isStart: isStartOfContent,
            isEnd: isEndOfContent,
            keywords: s.keywords.map((k) => {
                return { start: k.start - start, length: k.length }
            }),
        })
    }

    const getContentSnippets = (contentPositions, content) => {
        content = (content || '').trim()

        return contentPositions
            ? contentPositions
                  .sort(orderByStartPosition)
                  .reduce(collectSnippetPositions.bind(null, content.length), [])
                  .map(getSnippet.bind(null, content))
                  .slice(0, 3)
            : [
                  {
                      isFirst: true,
                      isLast: false,
                      content: content.substring(0, 100),
                      keywords: contentPositions,
                  },
              ]
    }

    const generateResultHtml = (result) => {
        const li = document.createElement('li')
        li.append(getResultItemLink(result))
        li.append(createElementFromHTML(`<p>${result.item.subtitle}</p>`))
        const snippets = getContentSnippets(result.positions.content, result.item.content)
        if (snippets) {
            const p = document.createElement('p')
            snippets.forEach((snippet) => p.append(snippetToHtml(snippet)))
            li.append(p)
        }
        return li
    }

    const snippetToHtml = (s) => {
        const span = document.createElement('span')
        span.append(s.content)
        span.className = [s.isStart ? 'start' : '', s.isEnd ? 'end' : ''].join(' ')
        const instance = new Mark(span)
        instance.markRanges(s.keywords)
        return span
    }
    const getResultItemLink = (result) => {
        const linkElement = document.createElement('a')
        linkElement.append(result.item.title)
        linkElement.href = result.item.uri
        const instance = new Mark(linkElement)
        instance.markRanges(result.positions.title)
        return linkElement
    }

    const resultNode = document.createElement('ul')
    resultList.forEach((result) => resultNode.append(generateResultHtml(result)))
    return resultNode
}

const getResults = (query) =>
    query
        ? fuse
              // ' is a token for extended search needed to find items that include the value
              // it prevents fuzzy search
              .search(`'${query}`, {
                  limit: 16,
              })
              .map((result) => {
                  let positions = { title: [], subtitle: [], content: [] }
                  result.matches.map((match) => {
                      match.indices.map((index) => {
                          positions[match.key].push({
                              length: index[1] - index[0] + 1,
                              start: index[0],
                          })
                      })
                  })
                  return {
                      ...result,
                      positions,
                  }
              })
        : null

const debounce = (func, wait, immediate) => {
    let timeout

    return function () {
        const context = this
        const args = arguments
        const callNow = immediate && !timeout

        clearTimeout(timeout)

        timeout = setTimeout(() => {
            timeout = null
            if (!immediate) {
                func.apply(context, args)
            }
        }, wait)

        if (callNow) func.apply(context, args)
    }
}
