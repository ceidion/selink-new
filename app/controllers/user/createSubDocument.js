// Create new sub document
var User = require('mongoose').model('User');

module.exports = function(req, res, next) {

    User.findById(req.params.id, function(err, user) {
        if (err) next(err);
        else {

            var length = user[req.params.sub].push(req.body);

            user.save(function(err, updatedUser) {
                if (err) next(err);
                else {

                    // index user in solr
                    solr.add(updatedUser.toSolr(), function(err, solrResult) {
                        if (err) next(err);
                        else {
                            console.log(solrResult);
                            solr.commit(function(err,res){
                               if(err) console.log(err);
                               if(res) console.log(res);
                            });
                        }
                    });

                    res.send(updatedUser[req.params.sub][length - 1]);
                }
            });
        }
    });
};