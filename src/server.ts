#!/usr/bin/env node
import { extract, parseMarkup, resolveConfig, stringifyMarkup } from 'emmet'
import { FieldOutput } from 'emmet/dist/src/config'
import { TextDocument } from 'vscode-languageserver-textdocument'
import {
    CompletionItem,
    CompletionItemKind,
    createConnection,
    DidChangeConfigurationNotification,
    InitializeParams,
    InitializeResult,
    InsertTextFormat,
    ProposedFeatures,
    TextDocumentPositionParams,
    TextDocuments,
    TextDocumentSyncKind,
} from 'vscode-languageserver/node'

let connection = createConnection(ProposedFeatures.all)

// Create a simple text document manager.
let documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument)

let hasConfigurationCapability: boolean = false
let hasWorkspaceFolderCapability: boolean = false
let hasDiagnosticRelatedInformationCapability: boolean = false

const outField: FieldOutput = (index, placeholder) =>
    ` \$\{${index}${placeholder ? ':' + placeholder : ''}\} `

const getConfig = (languageId: string) => {
    let config = null
    switch (languageId) {
        case 'scss':
        case 'css': {
            config = resolveConfig({
                type: 'stylesheet',
                options: {
                    'output.field': outField,
                },
            })
            break
        }
        case 'typescriptreact':
        case 'javascriptreact':
        case 'typescript.tsx':
        case 'typescript.jsx': {
            config = resolveConfig({
                type: 'markup',
                options: {
                    'output.field': outField,
                    'jsx.enabled': true,
                },
            })
            break
        }
        default: {
            config = resolveConfig({
                type: 'markup',
                options: {
                    'output.field': outField,
                },
            })
        }
    }
    return config
}

connection.onCompletionResolve((item: CompletionItem): CompletionItem => {
    item.insertTextFormat = InsertTextFormat.Snippet
    return item
})

connection.onInitialize((params: InitializeParams) => {
    let capabilities = params.capabilities

    // Does the client support the `workspace/configuration` request?
    // If not, we fall back using global settings.
    hasConfigurationCapability = !!(
        capabilities.workspace && !!capabilities.workspace.configuration
    )
    hasWorkspaceFolderCapability = !!(
        capabilities.workspace && !!capabilities.workspace.workspaceFolders
    )
    hasDiagnosticRelatedInformationCapability = !!(
        capabilities.textDocument &&
        capabilities.textDocument.publishDiagnostics &&
        capabilities.textDocument.publishDiagnostics.relatedInformation
    )

    const result: InitializeResult = {
        capabilities: {
            textDocumentSync: TextDocumentSyncKind.Incremental,
            // Tell the client that this server supports code completion.
            completionProvider: {
                resolveProvider: true,
            },
        },
    }
    if (hasWorkspaceFolderCapability) {
        result.capabilities.workspace = {
            workspaceFolders: {
                supported: true,
            },
        }
    }
    return result
})

connection.onInitialized(() => {
    if (hasConfigurationCapability) {
        // Register for all configuration changes.
        connection.client.register(
            DidChangeConfigurationNotification.type,
            undefined
        )
    }
    if (hasWorkspaceFolderCapability) {
        connection.workspace.onDidChangeWorkspaceFolders((_event) => {
            connection.console.log('Workspace folder change event received.')
        })
    }
})

connection.onCompletionResolve((item: CompletionItem): CompletionItem => {
    item.insertTextFormat = InsertTextFormat.Snippet
    connection.console.info(
        `[Emmet LS] on position resolve${JSON.stringify(item, null, 2)}`
    )
    return item
})

connection.onCompletion(
    (_textDocumentPosition: TextDocumentPositionParams): CompletionItem[] => {
        try {
            const doc = documents.get(_textDocumentPosition.textDocument.uri)
            if (!doc) throw 'failed to find document'
            const languageId = doc.languageId
            connection.console.info(`[Emmet LS] languageId: ${languageId}`)
            const content = doc.getText()

            connection.console.info(
                `[Emmet LS] doc position: ${JSON.stringify(
                    _textDocumentPosition.position,
                    null,
                    2
                )}`
            )
            const linenr = _textDocumentPosition.position.line
            connection.console.info(`[Emmet LS] line number: ${linenr}`)
            const line = String(content.split(/\r?\n/g)[linenr])
            connection.console.info(`[Emmet LS] line: ${line}`)
            const character = _textDocumentPosition.position.character
            connection.console.info(`[Emmet LS] character: ${character}`)
            let extractPosition =
                languageId != 'css'
                    ? extract(line, character)
                    : extract(line, character, { type: 'stylesheet' })

            if (extractPosition?.abbreviation == undefined) {
                throw `Failed to parse line: ${line}`
            }

            connection.console.info(
                `[Emmet LS] extracted emmet position: ${JSON.stringify(
                    extractPosition,
                    null,
                    2
                )}`
            )
            let left = extractPosition.start
            let right = extractPosition.end
            let abbreviation = extractPosition.abbreviation
            const config = getConfig(languageId)

            connection.console.info(
                `[Emmet LS] generated config: ${JSON.stringify(
                    config,
                    null,
                    2
                )}`
            )
            const markup = parseMarkup(abbreviation, config)
            connection.console.info(
                `[Emmet LS] emmet markup: ${JSON.stringify(markup, null, 2)}`
            )
            const textResult = stringifyMarkup(markup, config)
            connection.console.info(`[Emmet LS] markup: ${textResult}`)
            const range = {
                start: {
                    line: linenr,
                    character: left,
                },
                end: {
                    line: linenr,
                    character: right,
                },
            }

            const result = {
                insertTextFormat: InsertTextFormat.Snippet,
                label: abbreviation,
                detail: textResult,
                documentation: textResult,
                textEdit: {
                    range,
                    newText: textResult,
                },
                kind: CompletionItemKind.Snippet,
                data: {
                    range,
                    textResult,
                },
            }

            connection.console.info(
                `[Emmet LS] language server result: ${JSON.stringify(
                    result,
                    null,
                    2
                )}`
            )

            return [result]
        } catch (error) {
            connection.console.error(`[Emmet LS] ERR: ${error}`)
        }

        return []
    }
)

documents.listen(connection)

connection.listen()
