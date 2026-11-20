# A PDF-backed correction in the working vault

The shared entry point receives the full user goal. It composes the installed
local PDF and Spectrolite call trees when the goal connects an approved PDF
source to a draft vault document.

| Part | Implementation |
| --- | --- |
| Interpret the request and pick its source | The shared Natlang root calls the installed PDF policy. Its chooser selects the observed file and page and decides whether to read text, layout, or the rendered page. |
| Determine whether the evidence supports the correction | A typed Natlang child chooses the smallest verbatim citation supporting the requested change or issues a hold. It only considers the PDF result from this invocation. |
| Bind the correction to the source | A scoped service verifies the citation against original file bytes and native PDF receipts and attaches exact source provenance to the existing user goal. It opens the vault capabilities only after a successful handoff. |
| Locate and update the working note | The installed Spectrolite policy navigates actual wiki-links, edits the authorized working note, and inspects the displayed revision. It preserves independently edited material. |
| Observe an intervening edit | The managed world may add a colleague's draft edit through semantic VCS at the first attempted write. The existing revision check rejects the old write and requires fresh renderer evidence before retry. |
| Verify the outcome | The runner checks the original PDF and the rendered and canonical vault versions, the exact independent draft change, and that committed and main state remain protected. |
