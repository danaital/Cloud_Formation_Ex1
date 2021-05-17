// Due to zipFile limit of 4096 characters and due to indents which cost multiple chars also
// I have added more the expanded version with added white space

// Requires //
const aws = require('aws-sdk');

// Setting Dynamo DB //
const ddb = new aws.DynamoDB.DocumentClient({region: 'us-east-2'});
const tableName = "Ex1Fin";

// Time & Charge constants //
const sec = 1000;
const min = 60 * sec;
const quarter = 15 * min;
const hour = 60 * min;
const day = 24 * hour;
const pay = 2.5;

// Handler //
exports.handler = async (event, context, callback) => {
    // take relevant params from event and constant
    let path = event.path;// to double check validity
    let id = context.awsRequestId;// AWS request id for Entry
    let plate = event.queryStringParameters.plate;//the plate of the car for Entry
    let parkingLot = event.queryStringParameters.parkingLot;// the parking lot id for Entry
    let ticketId = event.queryStringParameters.ticketId;// the ticket returned for Exit
    // data -> will get the returnable data
    let data;
    // double check
    if (path !== '/entry' && path !== '/exit') {
        data = {
            statusCode: 403,
            error: {
                message: `${path} is an invalid path`
            },
            headers: {
                'Access-Control-Allow-Origin': '*'
            }
        }
    } else if ((plate === undefined && parkingLot === undefined) && ticketId !== undefined && path === `/exit`) {
        // if both plate and parkinglot are not given , ticketId is given and path is /exit-> we are in a legal exit case
        data = await exitResponse(ticketId);
    } else if ((plate !== undefined && parkingLot !== undefined) && ticketId === undefined && path === `/entry`) {
        // if both plate and parkinglot are given , ticketId is not given and path is /entry-> we are in a legal entry case
        data = await entryResponse(id, plate, parkingLot);
    } else {
        // otherwise it is a invalid case
        data = await invalidResponse();
    }
    // callback to data
    callback(null, data);
};

// Data Setters //
// Invalid Request
const invalidResponse = async () => {
    return {
        statusCode: 400,
        error: {
            message: "invalid query string parameter"
        },
        headers: {
            'Access-Control-Allow-Origin': '*'
        }
    };
};

// Entry Case
const entryResponse = async (id, plate, parkingLot) => {
    // set up data
    let data;
    // waiting to put the new ticket in DB (asynchronous action)
    await insertNewTicket(id, plate, parkingLot).then(() => {
        // success case
        data = {
            statusCode: 201,
            body: id,//awsRequestId is setted up for return
            headers: {
                'Access-Control-Allow-Origin': '*'
            }
        };
    }).catch((err) => {
        data = {
            statusCode: 400,
            error: err,
            headers: {
                'Access-Control-Allow-Origin': '*'
            }
        };
    });
    return data;
};

// Exit Case
const exitResponse = async (ticketId) => {
    // set up vars to hold the data
    let ticket;
    let newData;
    // waiting to for query with given ticket to return DB (asynchronous action)
    await queryID(ticketId).then(async (data) => {
        // success case
        ticket = data.Items[0]; // ticketData, reason why [0] in the Items is due to the fact is array
        let timeParked = new Date() - new Date(JSON.parse(ticket.entryDate));// total parked time in ms , Note we parsed it from JSON due to line 139 comment
        newData = {
            statusCode: 200,
            body: JSON.stringify({
                plate: ticket.plate,
                time: timeCalcAsString(timeParked),// formatted time
                parkingLot: ticket.parkingLot,
                charge: (myP(timeParked / quarter)) * pay,// ms/15 as INT will give us the floor then multiplied by 2.5, there are no other rules like first hour free etc.
            }),
            headers: {
                'Access-Control-Allow-Origin': '*'
            }
        };
    }).catch((err) => {
        // fail case
        newData = {
            statusCode: 400,
            error: err,
            headers: {
                'Access-Control-Allow-Origin': '*'
            }
        };
    });
    return newData;
};


// Assisting Functions //
// Entry Assistance Function
async function insertNewTicket(id, plate, parkingLot) {
    // Setup the data
    const params = {
        TableName: tableName,
        Item: {
            id: id,
            plate: plate,
            entryDate: JSON.stringify(new Date()),// the date was unreadable in Dynamo DB GUI if wasn't stringfy
            parkingLot: parkingLot,
        }
    };
    // put in db
    ddb.put(params).promise();
}

// Exit Assistance Functions
async function queryID(id) {
    // setting the query
    const params = {
        TableName: tableName,
        KeyConditionExpression: "#ID = :id",
        ExpressionAttributeNames: {
            "#ID": "id"
        },
        ExpressionAttributeValues: {
            ":id": id
        }
    };
    // running it
    return ddb.query(params).promise();
}

const timeCalcAsString = (ms) => {
    // invalid time -> unreachable case from my code but wrote it as error control
    if (ms < 0) {
        return "Nope";
    }
    // formatting time from ms
    let days = ms / day;
    let hours = (ms % day) / hour;
    let mins = (ms % hour) / min;
    let secs = (ms % min) / sec;
    let ms1 = ms % sec;
    // setting up the return value according to the time format
    let val = `Your parked time in total is :`;
    val += days > 0 ? ` ${myP(days)} days,` : '';
    val += hours > 0 ? ` ${myP(hours)} hours,` : '';
    val += mins > 0 ? ` ${myP(mins)} minutes,` : '';
    val += secs > 0 ? ` ${myP(secs)} seconds,` : '';
    val += ms1 > 0 ? ` ${myP(ms1)} milliseconds.` : '';
    // styling the return
    val = val.charAt(val.length - 1 === ',') ? val.slice(0, -1) + '.' : val;
    return val;
};
// Helper function to save characters
const myP = (n) => parseInt(n);
