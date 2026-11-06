# Changelog

All notable changes to this project are documented in this file. The format follows the spirit of
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/): an `[Unreleased]` section plus
versioned, dated entries in reverse-chronological order (SemVer), with changes listed as
flat bullets prefixed by type (`Bugfix:`, `Feature:`, …) rather than grouped into
Added/Changed/Fixed sections. Each release links to its git tag. The versions before this file
existed were reconstructed from the git history.

Versioning note: minor releases mark visible feature jumps; patch releases cover bugfixes and
maintenance updates, including text and style polish that does not change behavior.

## [1.5.0](https://github.com/enheragu/psychometric-tools/releases/tag/v1.5.0) - 2026-11-06
- License: the code is released under the MIT License, except the C-NRSBTool country indicators, which keep the licenses of UNDP and the World Bank (v1.0.0 was deposited in Zenodo under CC BY 4.0).
- Data: DIF-AnalysisTool examples are now synthetic, with DIF built into known items so results can be checked. The previous files, and two result tables the tool did not use, were removed because their terms do not clearly allow redistribution.
- Bugfix: TSW stopped with an error on any polytomous data since v1.4.0, because the starting point of the fit carried only two parameters per item. Those analyses run again; dichotomous items are unaffected.
- Bugfix: the logistic regression of C-NRSBTool stopped before reaching the maximum-likelihood estimate, so coefficients and p-values were wrong and a clear relationship could read as not significant (one 20-country list goes from β₁ = 3.13, p = .071 to β₁ = 13.20, p < .001). It now fits by IRLS. When the groups are separated and that estimate does not exist, it uses Firth's penalized likelihood and says so; lists with a single selected or non-selected country are not fitted.
- Docs: DIF-AnalysisTool described MH + TSW as recomputing anchors, but it takes the items free of DIF in MH as fixed anchors, so the verdict comes from MH. The description now says so.
- Docs: citation metadata, Zenodo DOI badge, *How to cite* section and this changelog.

## [1.4.2](https://github.com/enheragu/psychometric-tools/releases/tag/v1.4.2) - 2026-10-26
- Bugfix: the landing page was blank in production after the July theme refactor, because its engine was loaded from a path that does not exist on the published site; it now loads through the shared theme. Also fixed the URL of the C-NRSBTool zoom plugin.
- Refactor: more of the layout, widgets and styles come from the shared theme, removing duplicated code.
- Data: HDI and income-group snapshots refreshed by the scheduled update.

## [1.4.1](https://github.com/enheragu/psychometric-tools/releases/tag/v1.4.1) - 2026-05-29
- UI: common "Psychometric Tools" supertitle in the tool headers and text sizes taken from the shared theme.
- Bugfix: asset paths of the online version.
- Cleanup: removed local style fallbacks that could drift out of sync with the theme.

## [1.4.0](https://github.com/enheragu/psychometric-tools/releases/tag/v1.4.0) - 2026-05-17
- DIF-AnalysisTool: Mantel-Haenszel engine rewritten with a generalized multi-group statistic and Holm correction, fixing wrong results in some designs.
- DIF-AnalysisTool: TSW reworked to reproduce reference results computed in R; when both methods run, TSW can take the items that Mantel-Haenszel finds free of DIF as anchors.
- Feature: DIF-AnalysisTool exports results as CSV/JSON, can cancel a running analysis, warns before large datasets, and adds a lighter example.
- Bugfix: the three tools appear in the landing page and in the menu, in the right order.

## [1.3.0](https://github.com/enheragu/psychometric-tools/releases/tag/v1.3.0) - 2026-05-04
- Feature: new DIF-AnalysisTool, which detects Differential Item Functioning with Mantel-Haenszel and TSW likelihood-ratio tests with iterative purification, for multiple and nested groups, running entirely in the browser. Includes example datasets.
- UI: og-images, favicons, sitemap and related-work references updated for the new tool; translated texts support abbreviations.
- Bugfix: the scheduled HDI update pointed to wrong paths and never ran; it now runs and also updates the income groups.

## [1.2.0](https://github.com/enheragu/psychometric-tools/releases/tag/v1.2.0) - 2026-04-30
- Feature: DIF-AccumulationTool can repeat the simulation up to 1000 times and averages the results.
- UI: plots are read-only in the compact view and support pan, zoom and reset when maximized; smoother violin plots and better placed status messages.
- Docs: rewritten introductions and usage instructions, with rich-text formatting.
- Change: C-NRSBTool reports the odds ratio per 0.01 HDI, exp(β₁/100), instead of per whole unit, which spans the entire HDI scale.
- Bugfix: switching language re-renders the tools correctly.

## [1.1.0](https://github.com/enheragu/psychometric-tools/releases/tag/v1.1.0) - 2026-04-12
- Feature: C-NRSBTool also analyses World Bank income groups, with an HDI/income colour mode in the country map.
- Feature: DIF-AccumulationTool supports dichotomous items (2PL model, with its own example) and reports the group difference as Cohen's d.

## [1.0.1](https://github.com/enheragu/psychometric-tools/releases/tag/v1.0.1) - 2026-04-06
- Cleanup: removed mlv-tools code that was bundled in this repository and outdated related-work entries.

## [1.0.0](https://github.com/enheragu/psychometric-tools/releases/tag/v1.0.0) - 2026-03-22
- First release: a landing page that brings together C-NRSBTool and DIF-AccumulationTool on the shared tool theme. Archived in Zenodo by manual upload, [10.5281/zenodo.19163769](https://doi.org/10.5281/zenodo.19163769).
