let Plot;
import("https://cdn.jsdelivr.net/npm/@observablehq/plot@0.6/+esm").then(module => {
    Plot = module;
    // Your code that uses Plot here

    // import * as Plot from "https://cdn.jsdelivr.net/npm/@observablehq/plot@0.6.11/+esm";
    // import data from '../data_summary.json' assert { type: 'json' };
    // import DOMAIN_GROUPS from '../constants/domain_groups.json' assert { type: 'json' };
    
    
    // import data from '../constants/domain_source_counts.json' assert { type: 'json' };
    
    const clean = prepareDataSummary(data)
    
    // Step 1: Reverse the DOMAIN_GROUPS dictionary to get source-to-domain mapping
    const reversedDomainGroups = {};
    for (const [domain, sources] of Object.entries(DOMAIN_GROUPS)) {
        for (const source of sources) {
            reversedDomainGroups[source] = domain;
        }
    }
    
    // Step 2: Count the frequency of each source
    const sourceCounts = {};
    for (const obj of clean) {
        for (const source of obj['textSources']) {
            if (sourceCounts[source]) {
                sourceCounts[source]++;
            } else {
                sourceCounts[source] = 1;
            }
        }
    }
    
    // Step 3: Categorize sources and build the nested dictionary
    const nestedDict = {};
    for (const [source, count] of Object.entries(sourceCounts)) {
        const domain = reversedDomainGroups[source];
        if (nestedDict[domain]) {
            nestedDict[domain][source] = count;
        } else {
            nestedDict[domain] = { [source]: count };
        }
    }
    
    //tree formatting
    let treedata = [];
    let sumAll = 0;
    Object.values(nestedDict).forEach((s) => sumAll += Object.values(s).reduce((a, b) => a + b))
    
    let sortData = Object.entries(nestedDict).sort((a, b) => {
        if (Object.values(a[1]).reduce((i, j) => i + j) > Object.values(b[1]).reduce((i, j) => i + j)) {
            return -1;
        }
    })
    
    for (const [domain, source] of sortData) {
        let sumDom = Object.values(source).reduce((a, b) => a + b)
        let sorted = Object.entries(source).sort((a, b) => b[1] - a[1])
    
        let cleanArr = sorted.slice(0, 5)
    
        if (sorted.length > 5) {
            let otherArr = sorted.slice(5)
            let sumOther = 0;
            otherArr.forEach((o) => sumOther += o[1])
            cleanArr.push(['Other', sumOther])
        }
    
        cleanArr.forEach((s) => {
            var treeStr = domain + ` (${(sumDom / sumAll * 100).toFixed(2)}%)` + "]" + `${s[0].length < 15 ? s[0] : s[0].slice(0, 14) + '...'}` + ` (${(s[1] / sumAll * 100).toFixed(2)}%)`;
            treedata.push(treeStr)
        })
    }
    
    const treeDiv = document.createElement("div")
    treeDiv.setAttribute("class", "treeDiv")
    const treeId = `treeDiv${document.getElementsByClassName("treeDiv").length + 1}` //count the existing treeDivs and assign a new id by incrementing count
    treeDiv.setAttribute("id", treeId)
    document.querySelector('#container').append(treeDiv)
    document.querySelector(`#${treeId}`).append(Plot.plot({
        axis: null,
        height: 1500,
        margin: 10,
        marginLeft: 40,
        marginRight: 150,
        marks: [
            Plot.tree(treedata, { delimiter: "]" })
        ]
    }))

});