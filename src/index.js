const removeDiacritics = require('./removeDiacritics');
const util = require('util');
const parser = require('xml2js');
const fs = require('fs');
const writeFile = util.promisify(fs.writeFile);
const readFile = util.promisify(fs.readFile);
const parseString = util.promisify(parser.parseString);

module.exports = function (fileName) {
    return readFile(fileName, 'utf8')
        .then(parseString)
        .then(getPdmInfo)
        .catch(e => null);
}

function getPdmInfo(parsedJson) {
    const tables = getTablesObject(parsedJson);
    return formatTables(tables);
}

function getTablesObject(object) {

    if (typeof object !== 'object') {
        return;
    }

    for (const key in object) {
        if (typeof key === "string" && key.includes('Tables')) {
            return object[key][0]
        }

        const ret = getTablesObject(object[key]);

        if (ret) return ret;
    }
}

function formatTables(tables) {
    const formattedTables = {};
    const tablesArray = getByName(tables, 'Table');
    tablesArray.forEach(t => {
        const name = getFormattedName(t);
        const code = getByName(t, 'Code')[0];
        const columns = getByName(getByName(t, 'Columns')[0], 'Column')
            .map(formatColumn);
        formattedTables[code] = { name, code, columns };
    });

    return formattedTables;
}

function formatColumn(c) {
    return {
        name: getFormattedName(c),
        code: getByName(c, 'Code')[0]
    }
}

function getFormattedName(obj) {
    return removeDiacritics(getByName(obj, 'Name')[0])
        .replace(/ /g, "")
        .replace(/\W/g, "");
}

function getByName(obj, name) {
    for (const key in obj) {
        if (key.includes(name)) {
            return obj[key];
        }
    }
}