"""Assemble the shared star-map HTML, CSS and runtime for the MiniTool."""

from __future__ import annotations

import json
import re
from html.parser import HTMLParser


def replace_index_script(index: str, source: str, replacement: str) -> str:
    pattern = rf'<script\s+src\s*=\s*"{re.escape(source)}(?:\?[^"]*)?"\s*>\s*</script\s*>'
    index, count = re.subn(pattern, lambda _match: replacement, index)
    if count != 1:
        raise SystemExit(f"Expected one script tag for {source} in index.html")
    return index


class _RootDivParser(HTMLParser):
    def __init__(self, source: str, target_id: str) -> None:
        super().__init__(convert_charrefs=False)
        self.source = source
        self.offsets = [0]
        for line in source.splitlines(keepends=True):
            self.offsets.append(self.offsets[-1] + len(line))
        self.target_id = target_id
        self.start: int | None = None
        self.end: int | None = None
        self.depth = 0

    def _offset(self) -> int:
        line, col = self.getpos()
        return self.offsets[min(line - 1, len(self.offsets) - 1)] + col

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if self.end is not None:
            return
        attr = dict(attrs)
        if self.start is None and tag == "div" and attr.get("id") == self.target_id:
            self.start = self._offset()
            self.depth = 1
        elif self.start is not None and tag == "div":
            self.depth += 1

    def handle_endtag(self, tag: str) -> None:
        if self.start is None or self.end is not None or tag != "div":
            return
        self.depth -= 1
        if self.depth == 0:
            close = self.source.find(">", self._offset())
            if close < 0:
                raise SystemExit("Could not close the star-map root element")
            self.end = close + 1


def extract_star_map(source: str) -> tuple[str, str]:
    parser = _RootDivParser(source, "star-map-mock")
    parser.feed(source)
    if parser.start is None or parser.end is None:
        raise SystemExit("Could not locate the star-map root element")
    markup = source[parser.start:parser.end]

    style_blocks = re.findall(r"<style\b[^>]*>([\s\S]*?)</style\s*>", source, re.IGNORECASE)
    styles = [style.strip() for style in style_blocks if "#star-map-mock" in style]
    if not styles:
        raise SystemExit("Could not extract the star-map styles")
    css = "\n\n".join(styles)

    markup = re.sub(r"<style\b[^>]*>[\s\S]*?</style\s*>", "", markup, flags=re.IGNORECASE)
    markup = re.sub(r"<script\b[^>]*>[\s\S]*?</script\s*>", "", markup, flags=re.IGNORECASE)
    if re.search(r"<\s*(?:iframe|object)\b|\son[a-z]+\s*=", markup, flags=re.IGNORECASE):
        raise SystemExit("The extracted star-map markup contains a blocked element or inline handler")

    runtime = re.search(r'<script id="star-map-runtime">([\s\S]*?)</script>', source)
    if runtime is None:
        raise SystemExit("Could not locate the shared star-map runtime")

    wrapped = (
        "(function (parts) {\n'use strict';\n"
        + runtime[1].strip()
        + "\nparts.starMapHost = {\n"
        "  markup: function () { return " + json.dumps(markup, ensure_ascii=False) + "; },\n"
        "  mount: function (pane, receive) {\n"
        "    return pane.querySelector('#star-map-mock') ? _smMount(receive, false) : null;\n"
        "  }\n"
        "};\n"
        "})(window.SB.ui.renderParts);\n"
    )
    return css, wrapped
