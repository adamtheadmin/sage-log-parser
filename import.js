/*//===
    Parse Sage Cloudwatch Log
*///===

const csv = require('csv'),
    waterfall = require('async/waterfall'),
    queue = require('async/queue'),
    path = require('path'),
    fs = require('fs'),
    qs = require('qs'),
    fsPromises = fs.promises,
    { spawn } = require('child_process'),
    cwd = process.cwd(),
    q = new queue((row, done) => {
        try {
            if (row.length < 25){
                return done(null)
            }
            let parts = row.split('>>>>'),
                querystring = parts[0].substring(parts[0].indexOf('JSON='), parts[0].length),
                requestQS = qs.parse(querystring).JSON,
                qsparsed = JSON.parse(requestQS),
                response = parts[1],
                clIndicator = response.indexOf('Content-Length:'),
                JSONStart = response.indexOf(' ', clIndicator + 16) + 1,
                JSONEnd = response.lastIndexOf('200'),
                responseJSON = response.substr(JSONStart, JSONEnd).replace('200 OK NULL [] []', ''),
                response2 = json_try_parse(responseJSON),
                requestStart = parts[0].indexOf('Request: ') + 8,
                requestEnd = parts[0].indexOf(' ', requestStart + 15),
                requestID = parts[0].substr(requestStart, requestEnd)

            for (var x in qsparsed) {
                let item = qsparsed[x],
                    foundResponse = false
                if (Array.isArray(item)) {
                    for (var y in item) {
                        if (response2 && (y in response2)) {
                            item[y].response = response2[y]
                            foundResponse = true
                        }
                    }
                }
                if (foundResponse) {
                    response2 = null
                }
            }

            let payload = {requestID, query : qsparsed, response : response2}

            fsPromises.writeFile(path.resolve(cwd, 'results', +(new Date) + Math.random() + '.json'), JSON.stringify(payload, null, 4))
                .then(() => done())
                .catch(e => {
                    console.log(e)
                    done()
                })
            console.log(`Wrote File`);
        } catch(e){
            //throw e;
            return done();
        }
    }, 5)

function json_try_parse (document) {
    while (document.length) {
        try {
            let response = JSON.parse(document)
            return response;
        } catch(e) {
            document = document.substr(0, document.length - 1)
            continue
        }
    }
    return null;
}

waterfall([
    next => {
        spawn('rm', ['-rf', cwd + '/results'])
            .on('exit', code => {
                if (code) {
                    console.log("Error deleting resutls")
                }
                next(null)
            })
    },
    next => {
        spawn('mkdir', [cwd + '/results'])
            .on('exit', code => {
                if( code ) {
                    console.log("Error creating results directory")
                }
                next(null)
            })
    },
    next => {
        let input = process.argv.pop(),
            filePath = path.resolve(input)

        fsPromises.access(filePath)
            .then(() => {
                process.nextTick(() => {
                    next(null, filePath)
                })
            })
            .catch(e => next(e))
    },
    (filePath, next) => {
        var row = 0
        fs.createReadStream(filePath)
            .pipe(csv.parse())
            .on('data', data => {
                row++
                if (row == 1) {
                    return
                }
                q.push(data)
            })
            .on('end', () => {
                next(null)
            })
    }
], err => {
    if (err) {
        throw new Error(err)
    }
    setTimeout(() => {
        console.log("Complete!");
    }, 50)
})