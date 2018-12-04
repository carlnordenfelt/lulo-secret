const aws    = require('aws-sdk');
const ssm    = new aws.SSM({ apiVersion: '2014-11-06' });
const crypto = require('crypto');
const log    = require('log4njs');
const pub    = {};

const DEFAULT_SECRET_LENGTH = 128;

pub.validate = function (event) {
    if (!event.ResourceProperties.Name) {
        throw new Error('Missing required property Name');
    }
};

pub.create = function (event, _context, callback) {
    const secretLength = event.ResourceProperties.SecretLength || DEFAULT_SECRET_LENGTH;
    const secret       = crypto.randomBytes(secretLength).toString('hex');

    putParameter(secret, event.ResourceProperties, function (error) {
        if (error) {
            return callback(error);
        }

        const data = {
            physicalResourceId: event.ResourceProperties.Name
        };
        callback(null, data);
    });
};

pub.delete = function (event, _context, callback) {
    deleteParameter(event.ResourceProperties.Name, callback);
};

pub.update = function (event, _context, callback) {
    getParameter(event.OldResourceProperties.Name, function (error, response) {
        if (error) {
            return callback(error);
        }

        putParameter(response.Parameter.Value, event.ResourceProperties, function (error) {
            if (error) {
                return callback(error);
            }

            const data = {
                physicalResourceId: event.ResourceProperties.Name
            };

            if (event.ResourceProperties.Name !== event.OldResourceProperties.Name) {
                deleteParameter(event.OldResourceProperties.Name, function (error) {
                    if (error) {
                        log.warn('Unable to delete old parameter: ' + event.OldResourceProperties.Name, error);
                    }
                    callback(null, data);
                });
            } else {
                callback(null, data);
            }
        });
    });
};

module.exports = pub;

function putParameter(secret, requestParams, callback) {
    const params = {
        Name: requestParams.Name,
        Type: 'SecureString',
        Value: secret,
        Description: requestParams.Description || 'Secret generated by lulo-plugin-secret',
        Overwrite: true
    };

    if (requestParams.KeyId) {
        params.KeyId = requestParams.KeyId;
    }
    ssm.putParameter(params, function (error) {
        if (error) {
            log.error('Unable to put parameter', { params: params, error: error });
        }
        return callback(error);
    });
}

function getParameter(name, callback) {
    const params = {
        Name: name,
        WithDecryption: true
    };
    ssm.getParameter(params, function (error, data) {
        if (error) {
            log.error('Unable to get parameter', { params: params, error: error });
        }
        return callback(error, data);
    });
}

function deleteParameter(name, callback) {
    const params = {
        Name: name
    };
    ssm.deleteParameter(params, function (error) {
        if (error && error.code !== 'ParameterNotFound') {
            log.error('Unable to delete parameter', { params: params, error: error });
            return callback(error);
        }
        return callback();
    });
}
