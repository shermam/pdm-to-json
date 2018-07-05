//https://www.npmjs.com/package/@iarna/rtf-to-html

const removeDiacritics = require('./removeDiacritics');
const util = require('util');
const parser = require('xml2js');
const fs = require('fs');
const writeFile = util.promisify(fs.writeFile);
const readFile = util.promisify(fs.readFile);
const parseString = util.promisify(parser.parseString);
const rtfToHTMLLib = util.promisify(require('@iarna/rtf-to-html').fromString);

module.exports = function (fileName) {

    return readFile(fileName, 'utf8')
        .then(parseString)
        .then(getPdmInfo)
        .catch(console.log);
}

async function getPdmInfo(parsedJson) {
    const model = parsedJson['Model']['o:RootObject'][0]['c:Children'][0]['o:Model'][0];
    const tables = model['c:Tables'][0]['o:Table'];
    const parsedModel = {};

    for (const table of tables) {
        const ref = table['$']['id'];
        const name = codify(table['a:Name'][0]);
        const code = table['a:Code'][0];
        const conceptualName = table['a:Name'][0];
        const comment = table['a:Comment'];
        const description = await rtfToHTML(table['a:Description']);
        const primaryKeyArray = table["c:PrimaryKey"][0]["o:Key"];
        const columns = await Promise.all(table["c:Columns"][0]["o:Column"].map(async column => {
            return {
                ref: column['$']['id'],
                name: codify(column['a:Name'][0]),
                code: column['a:Code'][0],
                conceptualName: column['a:Name'][0],
                description: await rtfToHTML(column['a:Description']),
                dataType: column['a:DataType'][0],
                isIdentity: !!Number(column['a:Identity']),
                isMandatory: !!Number(column['a:Mandatory']),
                isPrimaryKey: !!primaryKeyArray.find(k => k['$']['Ref'] === column['$']['id'])
            }
        }));

        parsedModel[code] = {
            ref, name, code, conceptualName, comment, description, columns
        };
    }

    return parsedModel;
}

async function rtfToHTML(arr) {
    try {
        if (arr && arr.length) {
            return await rtfToHTMLLib(arr[0]);
        }
    } catch (error) {
        return await arr;
    }
}

function codify(str) {
    return removeDiacritics(str)
        .replace(/ /g, "")
        .replace(/\W/g, "");
}

function findColumnByRef(parsedTable, ref) {
    return parsedTable.columns.find(c => c.ref === ref);
}

function findTableByRef(parsedModel, ref) {
    for (const key in parsedModel) {
        if (parsedModel[key].ref === ref) {
            return parsedModel[key];
        }
    }
}

// function getPdmInfo(parsedJson) {
//     const tables = getTablesObject(parsedJson);
//     return formatTables(tables);
// }

// function getTablesObject(object) {

//     if (typeof object !== 'object') {
//         return;
//     }

//     for (const key in object) {
//         if (typeof key === "string" && key.includes('Tables')) {
//             return object[key][0]
//         }

//         const ret = getTablesObject(object[key]);

//         if (ret) return ret;
//     }
// }

// function formatTables(tables) {
//     const formattedTables = {};
//     const tablesArray = getByName(tables, 'Table');
//     tablesArray.forEach(t => {
//         const name = getFormattedName(t);
//         const code = getByName(t, 'Code')[0];
//         const columns = getByName(getByName(t, 'Columns')[0], 'Column')
//             .map(formatColumn);
//         formattedTables[code] = { name, code, columns };
//     });

//     return formattedTables;
// }

// function formatColumn(c) {
//     return {
//         name: getFormattedName(c),
//         code: getByName(c, 'Code')[0]
//     }
// }

// function getFormattedName(obj) {
//     return removeDiacritics(getByName(obj, 'Name')[0])
//         .replace(/ /g, "")
//         .replace(/\W/g, "");
// }

// function getByName(obj, name) {
//     for (const key in obj) {
//         if (key.includes(name)) {
//             return obj[key];
//         }
//     }
// }