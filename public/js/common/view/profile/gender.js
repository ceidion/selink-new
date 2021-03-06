define([
    'common/view/item-base',
    'text!common/template/profile/gender.html'
], function(
    BaseView,
    template) {

    return BaseView.extend({

        // template
        template: template,

        // className
        className: 'row form-group',

        // initializer
        initialize: function() {
            this.events = _.extend({}, this.events, {
                'click .btn': 'save'
            });
        },

        // get user input data
        getData: function(event) {

            $target = $(event.target);

            // TODO: this is not right, but working :)
            if ($target.prop('tagName') == "I")
                return {
                    gender: $target.closest('.btn').find('input').val()
                };
            else
                return {
                    gender: $target.find('input').val()
                };
        },

        // render value by user input data
        renderValue: function(data) {
            this.ui.value.text(data.gender);
        }

    });
});