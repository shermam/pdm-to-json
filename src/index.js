

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
        const ref = table['$']['Id'];
        const name = codify(table['a:Name'][0]);
        const code = table['a:Code'][0];
        const conceptualName = table['a:Name'][0];
        const comment = table['a:Comment'];
        const description = await rtfToHTML(table['a:Description']);
        const primaryKeyArray = table["c:PrimaryKey"][0]["o:Key"];
        const columns = await getColumns(table);
        const keys = getKeys(table, primaryKeyArray, columns);

        parsedModel[code] = {
            ref,
            name,
            code,
            conceptualName,
            comment,
            description,
            columns,
            keys
        };
    }

    for (const tableCode in parsedModel) {
        const table = parsedModel[tableCode];
        table.inRelations = [];
        table.outRelations = [];
        const inReferences = model['c:References'][0]['o:Reference'].filter(r => r['c:ChildTable'][0]['o:Table'][0]['$']['Ref'] === table.ref);
        const outReferences = model['c:References'][0]['o:Reference'].filter(r => r['c:ParentTable'][0]['o:Table'][0]['$']['Ref'] === table.ref);

        mapInRelations(inReferences, parsedModel, table);
        mapOutRelations(outReferences, parsedModel, table);

    }

    return parsedModel;
}

function mapInRelations(inReferences, parsedModel, table) {
    for (const reference of inReferences) {
        const parentTable = findTableByRef(parsedModel, reference['c:ParentTable'][0]['o:Table'][0]['$']['Ref']);
        const parentColumnRef = reference['c:Joins'][0]['o:ReferenceJoin'][0]['c:Object1'][0]['o:Column'][0]['$']['Ref'];
        const childColumnRef = reference['c:Joins'][0]['o:ReferenceJoin'][0]['c:Object2'][0]['o:Column'][0]['$']['Ref'];
        table.inRelations.push({
            name: reference['a:Name'][0],
            code: reference['a:Code'][0],
            cardinality: reference['a:Cardinality'][0],
            parentRole: reference['a:ParentRole'][0],
            childRole: reference['a:ChildRole'][0],
            parentTable: parentTable.conceptualName,
            parentColumn: findColumnByRef(parentTable, parentColumnRef)['conceptualName'],
            childTable: table.conceptualName,
            childColumn: findColumnByRef(table, childColumnRef)['conceptualName']
        });
    }
}

function mapOutRelations(outReferences, parsedModel, table) {
    for (const reference of outReferences) {
        const childTable = findTableByRef(parsedModel, reference['c:ChildTable'][0]['o:Table'][0]['$']['Ref']);
        const parentColumnRef = reference['c:Joins'][0]['o:ReferenceJoin'][0]['c:Object1'][0]['o:Column'][0]['$']['Ref'];
        const childColumnRef = reference['c:Joins'][0]['o:ReferenceJoin'][0]['c:Object2'][0]['o:Column'][0]['$']['Ref'];
        table.outRelations.push({
            name: reference['a:Name'][0],
            code: reference['a:Code'][0],
            cardinality: reference['a:Cardinality'][0],
            parentRole: reference['a:ParentRole'][0],
            childRole: reference['a:ChildRole'][0],
            parentTable: table.conceptualName,
            parentColumn: findColumnByRef(table, parentColumnRef)['conceptualName'],
            childTable: childTable.conceptualName,
            childColumn: findColumnByRef(childTable, childColumnRef)['conceptualName']
        });
    }
}

function getKeys(table, primaryKeyArray, columns) {
    return table["c:Keys"][0]["o:Key"].map(key => {
        const ref = key['$']['Id'];
        const name = key['a:Name'][0];
        const code = key['a:Code'][0];
        const isPrimaryKey = !!primaryKeyArray.find(k => k['$']['Ref'] == key['$']['Id']);
        const columnsKey = getColumnsKey(key, columns, isPrimaryKey);
        return { ref, name, code, isPrimaryKey, columnsKey };
    });
}

function getColumnsKey(key, columns, isPrimaryKey) {
    return key['c:Key.Columns'][0]['o:Column'].map(cKey => {
        const column = columns.find(c => c.ref === cKey['$']['Ref']);
        column.isPrimaryKey = isPrimaryKey;
        return {
            name: column.name,
            code: column.code,
            conceptualName: column.conceptualName
        };
    });
}

async function getColumns(table) {
    return await Promise.all(table["c:Columns"][0]["o:Column"].map(async (column) => {
        return {
            ref: column['$']['Id'],
            name: codify(column['a:Name'][0]),
            code: column['a:Code'][0],
            conceptualName: column['a:Name'][0],
            description: await rtfToHTML(column['a:Description']),
            dataType: column['a:DataType'][0],
            isIdentity: column['a:Identity'] ? !!Number(column['a:Identity'][0]) : false,
            isMandatory: column['a:Column.Mandatory'] ? !!Number(column['a:Column.Mandatory'][0]) : false,
            isPrimaryKey: false
        };
    }));
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